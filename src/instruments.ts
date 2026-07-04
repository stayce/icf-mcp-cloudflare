/**
 * Clinical assessment instruments with ICF mappings.
 *
 * Standardized questionnaires used in Remote Patient Monitoring (RPM) for
 * functional assessment, mapped to ICF codes and qualifier scales.
 *
 * Ported from the Python reference implementation (icf-mcp-server v0.2.0).
 */

export interface ResponseOption {
  value: number;
  label: string;
}

export interface InstrumentItem {
  number: number;
  text: string;
  options: ResponseOption[];
}

export interface ScoreRange {
  minScore: number;
  maxScore: number;
  severity: string;
  description: string;
  icfQualifier: number | null;
}

export interface ICFMapping {
  code: string;
  name: string;
  relationship: "primary" | "secondary" | "related";
}

export interface ScoreResult {
  instrument: string;
  totalScore: number;
  minPossible: number;
  maxPossible: number;
  severity: string;
  description: string;
  icfQualifier: number | null;
  responseCount: number;
  // Instrument-specific extras
  activeDescriptors?: number;
  organSystems?: Record<string, boolean>;
  categoryScores?: Record<string, number>;
  gphRaw?: number;
  gmhRaw?: number;
  unit?: string;
}

export type ScoreOutcome = ScoreResult | { error: string };

export interface Instrument {
  id: string;
  name: string;
  abbreviation: string;
  description: string;
  domain: string;
  conditions: string[];
  items: InstrumentItem[];
  scoringMethod: "sum" | "mean" | "weighted" | "custom";
  scoreRanges: ScoreRange[];
  icfMappings: ICFMapping[];
  minScore: number;
  maxScore: number;
  recallPeriod: string;
  administration: "self-report" | "clinician" | "mixed";
  completionTime: string;
  references: string[];
  rpmFrequency: string;
  notes?: string;
  // Instruments with non-trivial scoring set this to a dedicated scorer;
  // when absent, the generic sum/mean path in scoreGeneric() applies.
  scorer?: (responses: number[]) => ScoreOutcome;
}

function range(min: number, max: number, severity: string, description: string, icfQualifier: number | null): ScoreRange {
  return { minScore: min, maxScore: max, severity, description, icfQualifier };
}

function map(code: string, name: string, relationship: ICFMapping["relationship"]): ICFMapping {
  return { code, name, relationship };
}

function buildResult(instrument: Instrument, total: number, extras: Partial<ScoreResult> = {}): ScoreResult {
  const result: ScoreResult = {
    instrument: instrument.abbreviation,
    totalScore: total,
    minPossible: instrument.minScore,
    maxPossible: instrument.maxScore,
    severity: "Unknown",
    description: "",
    icfQualifier: null,
    responseCount: instrument.items.length,
    ...extras,
  };
  for (const sr of instrument.scoreRanges) {
    if (sr.minScore <= total && total <= sr.maxScore) {
      result.severity = sr.severity;
      result.description = sr.description;
      result.icfQualifier = sr.icfQualifier;
      break;
    }
  }
  return result;
}

function scoreGeneric(instrument: Instrument, responses: number[]): ScoreOutcome {
  if (responses.length !== instrument.items.length) {
    return { error: `Expected ${instrument.items.length} responses, got ${responses.length}.` };
  }
  const sum = responses.reduce((a, b) => a + b, 0);
  const total = instrument.scoringMethod === "mean" ? sum / responses.length : sum;
  return buildResult(instrument, Math.round(total * 100) / 100);
}

// ── Standard response scales ────────────────────────────────────────────────

const LIKERT_0_3: ResponseOption[] = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

const LIKERT_0_4: ResponseOption[] = [
  { value: 0, label: "None" },
  { value: 1, label: "Mild" },
  { value: 2, label: "Moderate" },
  { value: 3, label: "Severe" },
  { value: 4, label: "Extreme / Cannot do" },
];

const VAS_0_10: ResponseOption[] = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));

// ── GAD-7 ────────────────────────────────────────────────────────────────────

const GAD7: Instrument = {
  id: "gad7",
  name: "Generalized Anxiety Disorder 7-Item Scale",
  abbreviation: "GAD-7",
  description:
    "A brief self-report measure to identify probable cases of generalized " +
    "anxiety disorder and assess symptom severity. Widely used in primary " +
    "care and RPM programs.",
  domain: "Mental Health",
  conditions: ["Generalized anxiety disorder", "Panic disorder", "Social anxiety disorder", "PTSD"],
  items: [
    { number: 1, text: "Feeling nervous, anxious, or on edge", options: LIKERT_0_3 },
    { number: 2, text: "Not being able to stop or control worrying", options: LIKERT_0_3 },
    { number: 3, text: "Worrying too much about different things", options: LIKERT_0_3 },
    { number: 4, text: "Trouble relaxing", options: LIKERT_0_3 },
    { number: 5, text: "Being so restless that it's hard to sit still", options: LIKERT_0_3 },
    { number: 6, text: "Becoming easily annoyed or irritable", options: LIKERT_0_3 },
    { number: 7, text: "Feeling afraid, as if something awful might happen", options: LIKERT_0_3 },
  ],
  scoringMethod: "sum",
  scoreRanges: [
    range(0, 4, "Minimal", "Minimal anxiety; monitor only", 0),
    range(5, 9, "Mild", "Mild anxiety; watchful waiting", 1),
    range(10, 14, "Moderate", "Moderate anxiety; consider treatment", 2),
    range(15, 21, "Severe", "Severe anxiety; active treatment indicated", 3),
  ],
  icfMappings: [
    map("b152", "Emotional functions", "primary"),
    map("b1522", "Range of emotion", "primary"),
    map("b1528", "Emotional functions, other specified", "secondary"),
    map("b130", "Energy and drive functions", "secondary"),
    map("b134", "Sleep functions", "related"),
    map("d240", "Handling stress and other psychological demands", "primary"),
    map("d720", "Complex interpersonal interactions", "related"),
  ],
  minScore: 0,
  maxScore: 21,
  recallPeriod: "2 weeks",
  administration: "self-report",
  completionTime: "2-3 minutes",
  references: ["Spitzer RL, Kroenke K, Williams JBW, Löwe B. A brief measure for assessing generalized anxiety disorder. Arch Intern Med. 2006;166(10):1092-1097."],
  rpmFrequency: "Weekly to biweekly",
};

// ── PHQ-9 ────────────────────────────────────────────────────────────────────

const PHQ9: Instrument = {
  id: "phq9",
  name: "Patient Health Questionnaire-9",
  abbreviation: "PHQ-9",
  description:
    "A 9-item self-report measure for screening, diagnosing, monitoring, " +
    "and measuring the severity of depression. Based on DSM criteria.",
  domain: "Mental Health",
  conditions: ["Major depressive disorder", "Persistent depressive disorder", "Adjustment disorder"],
  items: [
    { number: 1, text: "Little interest or pleasure in doing things", options: LIKERT_0_3 },
    { number: 2, text: "Feeling down, depressed, or hopeless", options: LIKERT_0_3 },
    { number: 3, text: "Trouble falling or staying asleep, or sleeping too much", options: LIKERT_0_3 },
    { number: 4, text: "Feeling tired or having little energy", options: LIKERT_0_3 },
    { number: 5, text: "Poor appetite or overeating", options: LIKERT_0_3 },
    { number: 6, text: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down", options: LIKERT_0_3 },
    { number: 7, text: "Trouble concentrating on things, such as reading the newspaper or watching television", options: LIKERT_0_3 },
    { number: 8, text: "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual", options: LIKERT_0_3 },
    { number: 9, text: "Thoughts that you would be better off dead, or of hurting yourself in some way", options: LIKERT_0_3 },
  ],
  scoringMethod: "sum",
  scoreRanges: [
    range(0, 4, "Minimal", "Minimal depression; may not require treatment", 0),
    range(5, 9, "Mild", "Mild depression; watchful waiting, repeat at follow-up", 1),
    range(10, 14, "Moderate", "Moderate depression; treatment plan indicated", 2),
    range(15, 19, "Moderately Severe", "Moderately severe depression; active treatment with pharmacotherapy and/or psychotherapy", 3),
    range(20, 27, "Severe", "Severe depression; immediate treatment, consider referral to specialist", 4),
  ],
  icfMappings: [
    map("b152", "Emotional functions", "primary"),
    map("b130", "Energy and drive functions", "primary"),
    map("b134", "Sleep functions", "primary"),
    map("b140", "Attention functions", "secondary"),
    map("b1300", "Energy level", "primary"),
    map("b5105", "Swallowing (appetite changes)", "secondary"),
    map("d230", "Carrying out daily routine", "primary"),
    map("d240", "Handling stress and other psychological demands", "secondary"),
    map("d177", "Making decisions", "related"),
    map("d920", "Recreation and leisure", "related"),
  ],
  minScore: 0,
  maxScore: 27,
  recallPeriod: "2 weeks",
  administration: "self-report",
  completionTime: "2-5 minutes",
  references: ["Kroenke K, Spitzer RL, Williams JBW. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001;16(9):606-613."],
  rpmFrequency: "Weekly to biweekly",
  notes: "Item 9 screens for suicidal ideation and requires immediate clinical follow-up if endorsed.",
};

// ── RADAI-5 ──────────────────────────────────────────────────────────────────

const RADAI5: Instrument = {
  id: "radai5",
  name: "Rheumatoid Arthritis Disease Activity Index-5",
  abbreviation: "RADAI-5",
  description:
    "A 5-item patient self-report measure of rheumatoid arthritis disease " +
    "activity. Uses 0-10 visual analog scales. Score is the mean of all items.",
  domain: "Rheumatology",
  conditions: ["Rheumatoid arthritis"],
  items: [
    { number: 1, text: "How active was your rheumatoid arthritis on average during the last 6 months?", options: VAS_0_10 },
    { number: 2, text: "How active is your rheumatoid arthritis today in terms of joint tenderness and swelling?", options: VAS_0_10 },
    { number: 3, text: "How would you describe your arthritis pain today?", options: VAS_0_10 },
    { number: 4, text: "How would you describe your current level of morning stiffness?", options: VAS_0_10 },
    { number: 5, text: "How would you rate your current overall functional capacity (ability to carry out daily activities)?", options: VAS_0_10 },
  ],
  scoringMethod: "mean",
  scoreRanges: [
    range(0.0, 1.4, "Near remission", "Disease activity near remission", 0),
    range(1.5, 3.0, "Low", "Low disease activity", 1),
    range(3.1, 5.0, "Moderate", "Moderate disease activity", 2),
    range(5.1, 7.5, "High", "High disease activity", 3),
    range(7.6, 10.0, "Very high", "Very high disease activity", 4),
  ],
  icfMappings: [
    map("b280", "Sensation of pain", "primary"),
    map("b710", "Mobility of joint functions", "primary"),
    map("b770", "Gait pattern functions", "secondary"),
    map("b7101", "Mobility of several joints", "primary"),
    map("s710", "Structure of head and neck region", "related"),
    map("s720", "Structure of shoulder region", "related"),
    map("s730", "Structure of upper extremity", "primary"),
    map("s750", "Structure of lower extremity", "primary"),
    map("d230", "Carrying out daily routine", "primary"),
    map("d440", "Fine hand use", "secondary"),
    map("d445", "Hand and arm use", "secondary"),
    map("d450", "Walking", "secondary"),
  ],
  minScore: 0.0,
  maxScore: 10.0,
  recallPeriod: "Today / 6 months (item 1)",
  administration: "self-report",
  completionTime: "2-3 minutes",
  references: ["Leeb BF, et al. The patient's perspective and rheumatoid arthritis disease activity indexes. Rheumatology. 2004;43(9):1122-1125."],
  rpmFrequency: "Weekly to monthly",
};

// ── SLEDAI-2K ────────────────────────────────────────────────────────────────

const SLEDAI_PRESENT_ABSENT: ResponseOption[] = [
  { value: 0, label: "Absent" },
  { value: 1, label: "Present" },
];

const SLEDAI2K: Instrument = {
  id: "sledai2k",
  name: "Systemic Lupus Erythematosus Disease Activity Index 2000",
  abbreviation: "SLEDAI-2K",
  description:
    "A weighted index measuring SLE disease activity across 24 descriptors " +
    "in 9 organ systems. Each descriptor is present/absent and carries a " +
    "predefined weight (1-8). Total is the sum of weights for present items.",
  domain: "Rheumatology",
  conditions: ["Systemic lupus erythematosus"],
  items: [
    { number: 1, text: "Seizure: recent onset, exclude metabolic, infectious, or drug causes", options: SLEDAI_PRESENT_ABSENT },
    { number: 2, text: "Psychosis: altered ability to function due to severe disturbance in perception of reality", options: SLEDAI_PRESENT_ABSENT },
    { number: 3, text: "Organic brain syndrome: altered mental function with impaired orientation, memory, or other cognitive function", options: SLEDAI_PRESENT_ABSENT },
    { number: 4, text: "Visual disturbance: retinal changes of SLE (cytoid bodies, retinal hemorrhages, choroid/optic neuritis)", options: SLEDAI_PRESENT_ABSENT },
    { number: 5, text: "Cranial nerve disorder: new onset sensory or motor neuropathy involving cranial nerves", options: SLEDAI_PRESENT_ABSENT },
    { number: 6, text: "Lupus headache: severe, persistent headache; may be migrainous, unresponsive to narcotics", options: SLEDAI_PRESENT_ABSENT },
    { number: 7, text: "CVA: new onset cerebrovascular accident(s), exclude arteriosclerosis", options: SLEDAI_PRESENT_ABSENT },
    { number: 8, text: "Vasculitis: ulceration, gangrene, tender finger nodules, periungual infarction, splinter hemorrhages, or biopsy/angiogram proof of vasculitis", options: SLEDAI_PRESENT_ABSENT },
    { number: 9, text: "Arthritis: ≥2 joints with pain and signs of inflammation", options: SLEDAI_PRESENT_ABSENT },
    { number: 10, text: "Myositis: proximal muscle aching/weakness associated with elevated CPK/aldolase, EMG changes, or biopsy showing myositis", options: SLEDAI_PRESENT_ABSENT },
    { number: 11, text: "Urinary casts: heme-granular or red blood cell casts", options: SLEDAI_PRESENT_ABSENT },
    { number: 12, text: "Hematuria: >5 red blood cells/high power field, exclude stone, infection, or other cause", options: SLEDAI_PRESENT_ABSENT },
    { number: 13, text: "Proteinuria: >0.5 g/24 hours, new onset or recent increase", options: SLEDAI_PRESENT_ABSENT },
    { number: 14, text: "Pyuria: >5 white blood cells/high power field, exclude infection", options: SLEDAI_PRESENT_ABSENT },
    { number: 15, text: "New rash: new onset or recurrence of inflammatory type rash", options: SLEDAI_PRESENT_ABSENT },
    { number: 16, text: "Alopecia: new onset or recurrence of abnormal, patchy or diffuse hair loss", options: SLEDAI_PRESENT_ABSENT },
    { number: 17, text: "Mucosal ulcers: new onset or recurrence of oral or nasal ulcerations", options: SLEDAI_PRESENT_ABSENT },
    { number: 18, text: "Pleurisy: pleuritic chest pain with pleural rub or effusion, or pleural thickening", options: SLEDAI_PRESENT_ABSENT },
    { number: 19, text: "Pericarditis: pericardial pain with at least 1 of: rub, effusion, or ECG/echo confirmation", options: SLEDAI_PRESENT_ABSENT },
    { number: 20, text: "Low complement: decrease in CH50, C3, or C4 below lower limit of normal", options: SLEDAI_PRESENT_ABSENT },
    { number: 21, text: "Increased DNA binding: >25% binding by Farr assay or above normal range", options: SLEDAI_PRESENT_ABSENT },
    { number: 22, text: "Fever: >38°C (100.4°F), exclude infectious cause", options: SLEDAI_PRESENT_ABSENT },
    { number: 23, text: "Thrombocytopenia: <100,000 platelets/mm³", options: SLEDAI_PRESENT_ABSENT },
    { number: 24, text: "Leukopenia: <3,000 white blood cells/mm³, exclude drug causes", options: SLEDAI_PRESENT_ABSENT },
  ],
  scoringMethod: "weighted",
  scoreRanges: [
    range(0, 0, "No activity", "No measurable disease activity", 0),
    range(1, 5, "Mild", "Mild disease activity", 1),
    range(6, 10, "Moderate", "Moderate disease activity", 2),
    range(11, 19, "High", "High disease activity; active treatment adjustment indicated", 3),
    range(20, 105, "Very high", "Very high disease activity; aggressive treatment indicated", 4),
  ],
  icfMappings: [
    map("b280", "Sensation of pain", "primary"),
    map("b430", "Haematological system functions", "primary"),
    map("b435", "Immunological system functions", "primary"),
    map("b440", "Respiration functions", "secondary"),
    map("b610", "Urinary excretory functions", "secondary"),
    map("b710", "Mobility of joint functions", "primary"),
    map("b730", "Muscle power functions", "secondary"),
    map("b810", "Protective functions of the skin", "secondary"),
    map("s410", "Structure of cardiovascular system", "related"),
    map("s610", "Structure of urinary system", "related"),
    map("s810", "Structure of areas of skin", "related"),
    map("d230", "Carrying out daily routine", "primary"),
    map("d450", "Walking", "related"),
    map("d5", "Self-care", "related"),
  ],
  minScore: 0,
  maxScore: 105,
  recallPeriod: "10 days",
  administration: "clinician",
  completionTime: "5-10 minutes",
  references: ["Gladman DD, Ibañez D, Urowitz MB. Systemic Lupus Erythematosus Disease Activity Index 2000. J Rheumatol. 2002;29(2):288-291."],
  rpmFrequency: "Monthly to quarterly",
  notes: "Weighted scoring: items 1-8 = 8 points each, 9-10 = 4 points each, 11-14 = 4 points each, 15-19 = 2 points each, 20-21 = 2 points each, 22-24 = 1 point each.",
};

// SLEDAI-2K item weights (1-indexed by item number)
const SLEDAI_WEIGHTS: Record<number, number> = {
  1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 8, 7: 8, 8: 8, // Neurological + Vascular
  9: 4, 10: 4, // Musculoskeletal
  11: 4, 12: 4, 13: 4, 14: 4, // Renal
  15: 2, 16: 2, 17: 2, 18: 2, 19: 2, // Dermal + Serositis
  20: 2, 21: 2, // Immunological
  22: 1, 23: 1, 24: 1, // Constitutional + Haematological
};

function scoreSledai(responses: number[]): ScoreOutcome {
  if (responses.length !== 24) {
    return { error: `SLEDAI-2K requires 24 responses, got ${responses.length}.` };
  }
  const total = responses.reduce((sum, resp, i) => sum + resp * SLEDAI_WEIGHTS[i + 1], 0);
  return buildResult(SLEDAI2K, total, {
    activeDescriptors: responses.reduce((a, b) => a + b, 0),
    organSystems: sledaiOrganSummary(responses),
  });
}

function sledaiOrganSummary(responses: number[]): Record<string, boolean> {
  const any = (from: number, to: number) => responses.slice(from, to).some(Boolean);
  return {
    neurological: any(0, 7),
    vascular: Boolean(responses[7]),
    musculoskeletal: any(8, 10),
    renal: any(10, 14),
    dermal: any(14, 17),
    serositis: any(17, 19),
    immunological: any(19, 21),
    constitutional: Boolean(responses[21]),
    haematological: any(22, 24),
  };
}

// ── WHODAS 2.0 (12-item) ────────────────────────────────────────────────────

const WHODAS2_12: Instrument = {
  id: "whodas2_12",
  name: "WHO Disability Assessment Schedule 2.0 (12-Item)",
  abbreviation: "WHODAS 2.0",
  description:
    "A 12-item version of the WHO Disability Assessment Schedule, directly " +
    "based on the ICF conceptual framework. Measures health and disability " +
    "across 6 life domains. The gold standard for ICF-linked assessment.",
  domain: "General Function",
  conditions: ["Any health condition", "Disability assessment", "Rehabilitation outcomes"],
  items: [
    { number: 1, text: "Standing for long periods such as 30 minutes?", options: LIKERT_0_4 },
    { number: 2, text: "Taking care of your household responsibilities?", options: LIKERT_0_4 },
    { number: 3, text: "Learning a new task, for example, learning how to get to a new place?", options: LIKERT_0_4 },
    { number: 4, text: "How much of a problem did you have joining in community activities (for example, festivities, religious or other activities) in the same way as anyone else can?", options: LIKERT_0_4 },
    { number: 5, text: "How much have you been emotionally affected by your health problems?", options: LIKERT_0_4 },
    { number: 6, text: "Concentrating on doing something for ten minutes?", options: LIKERT_0_4 },
    { number: 7, text: "Walking a long distance such as a kilometre [or equivalent]?", options: LIKERT_0_4 },
    { number: 8, text: "Washing your whole body?", options: LIKERT_0_4 },
    { number: 9, text: "Getting dressed?", options: LIKERT_0_4 },
    { number: 10, text: "Dealing with people you do not know?", options: LIKERT_0_4 },
    { number: 11, text: "Maintaining a friendship?", options: LIKERT_0_4 },
    { number: 12, text: "Your day-to-day work/school?", options: LIKERT_0_4 },
  ],
  scoringMethod: "sum",
  scoreRanges: [
    range(0, 4, "None", "No disability", 0),
    range(5, 12, "Mild", "Mild disability", 1),
    range(13, 24, "Moderate", "Moderate disability", 2),
    range(25, 36, "Severe", "Severe disability", 3),
    range(37, 48, "Extreme", "Extreme / complete disability", 4),
  ],
  icfMappings: [
    map("d410", "Changing basic body position", "primary"),
    map("d450", "Walking", "primary"),
    map("d510", "Washing oneself", "primary"),
    map("d540", "Dressing", "primary"),
    map("d640", "Doing housework", "primary"),
    map("d155", "Acquiring skills", "primary"),
    map("d160", "Focusing attention", "primary"),
    map("d710", "Basic interpersonal interactions", "primary"),
    map("d720", "Complex interpersonal interactions", "primary"),
    map("d910", "Community life", "primary"),
    map("d920", "Recreation and leisure", "secondary"),
    map("d850", "Remunerative employment", "primary"),
    map("b152", "Emotional functions", "secondary"),
  ],
  minScore: 0,
  maxScore: 48,
  recallPeriod: "30 days",
  administration: "self-report",
  completionTime: "5 minutes",
  references: ["Üstün TB, et al. Measuring Health and Disability: Manual for WHO Disability Assessment Schedule (WHODAS 2.0). WHO, 2010."],
  rpmFrequency: "Monthly",
  notes: "Directly derived from ICF. The WHO's recommended measure of health and disability.",
};

// ── HAQ-DI ───────────────────────────────────────────────────────────────────

const HAQ_OPTIONS: ResponseOption[] = [
  { value: 0, label: "Without any difficulty" },
  { value: 1, label: "With some difficulty" },
  { value: 2, label: "With much difficulty" },
  { value: 3, label: "Unable to do" },
];

const HAQ_DI: Instrument = {
  id: "haq_di",
  name: "Health Assessment Questionnaire - Disability Index",
  abbreviation: "HAQ-DI",
  description:
    "A 20-item self-report measure of functional ability across 8 categories " +
    "of daily living. Widely used in rheumatology for RA, PsA, SLE, and other " +
    "conditions. Score is the mean of 8 category scores (0-3).",
  domain: "Rheumatology",
  conditions: ["Rheumatoid arthritis", "Psoriatic arthritis", "Systemic lupus erythematosus", "Osteoarthritis", "Scleroderma"],
  items: [
    // Dressing & Grooming
    { number: 1, text: "Dress yourself, including tying shoelaces and doing buttons?", options: HAQ_OPTIONS },
    { number: 2, text: "Shampoo your hair?", options: HAQ_OPTIONS },
    // Arising
    { number: 3, text: "Stand up from a straight chair?", options: HAQ_OPTIONS },
    { number: 4, text: "Get in and out of bed?", options: HAQ_OPTIONS },
    // Eating
    { number: 5, text: "Cut your meat?", options: HAQ_OPTIONS },
    { number: 6, text: "Lift a full cup or glass to your mouth?", options: HAQ_OPTIONS },
    { number: 7, text: "Open a new milk carton?", options: HAQ_OPTIONS },
    // Walking
    { number: 8, text: "Walk outdoors on flat ground?", options: HAQ_OPTIONS },
    { number: 9, text: "Climb up five steps?", options: HAQ_OPTIONS },
    // Hygiene
    { number: 10, text: "Wash and dry your entire body?", options: HAQ_OPTIONS },
    { number: 11, text: "Take a tub bath?", options: HAQ_OPTIONS },
    { number: 12, text: "Get on and off the toilet?", options: HAQ_OPTIONS },
    // Reach
    { number: 13, text: "Reach and get down a 5-pound object from above your head?", options: HAQ_OPTIONS },
    { number: 14, text: "Bend down to pick up clothing from the floor?", options: HAQ_OPTIONS },
    // Grip
    { number: 15, text: "Open car doors?", options: HAQ_OPTIONS },
    { number: 16, text: "Open jars which have been previously opened?", options: HAQ_OPTIONS },
    { number: 17, text: "Turn faucets on and off?", options: HAQ_OPTIONS },
    // Activities
    { number: 18, text: "Run errands and shop?", options: HAQ_OPTIONS },
    { number: 19, text: "Get in and out of a car?", options: HAQ_OPTIONS },
    { number: 20, text: "Do chores such as vacuuming or yard work?", options: HAQ_OPTIONS },
  ],
  scoringMethod: "custom",
  scoreRanges: [
    range(0.0, 0.5, "Mild difficulty", "Mild to no functional difficulty", 0),
    range(0.51, 1.0, "Moderate difficulty", "Moderate functional difficulty", 1),
    range(1.01, 2.0, "Severe difficulty", "Severe functional difficulty", 2),
    range(2.01, 3.0, "Very severe", "Very severe disability; unable to perform most activities", 3),
  ],
  icfMappings: [
    map("d540", "Dressing", "primary"),
    map("d520", "Caring for body parts", "primary"),
    map("d410", "Changing basic body position", "primary"),
    map("d550", "Eating", "primary"),
    map("d560", "Drinking", "primary"),
    map("d450", "Walking", "primary"),
    map("d455", "Moving around", "primary"),
    map("d510", "Washing oneself", "primary"),
    map("d530", "Toileting", "primary"),
    map("d445", "Hand and arm use", "primary"),
    map("d440", "Fine hand use", "primary"),
    map("d430", "Lifting and carrying objects", "primary"),
    map("d640", "Doing housework", "primary"),
    map("d620", "Acquisition of goods and services", "secondary"),
    map("d470", "Using transportation", "secondary"),
  ],
  minScore: 0.0,
  maxScore: 3.0,
  recallPeriod: "Past week",
  administration: "self-report",
  completionTime: "5-8 minutes",
  references: ["Fries JF, et al. The Health Assessment Questionnaire: A clinical measure of arthritis. Arthritis Rheum. 1980;23(2):137-145."],
  rpmFrequency: "Monthly",
  notes: "Score = mean of 8 category scores. Each category score = highest item score in that category. Categories: dressing (1-2), arising (3-4), eating (5-7), walking (8-9), hygiene (10-12), reach (13-14), grip (15-17), activities (18-20).",
};

const HAQ_CATEGORIES: Record<string, number[]> = {
  "Dressing & Grooming": [1, 2],
  "Arising": [3, 4],
  "Eating": [5, 6, 7],
  "Walking": [8, 9],
  "Hygiene": [10, 11, 12],
  "Reach": [13, 14],
  "Grip": [15, 16, 17],
  "Activities": [18, 19, 20],
};

function scoreHaq(responses: number[]): ScoreOutcome {
  if (responses.length !== 20) {
    return { error: `HAQ-DI requires 20 responses, got ${responses.length}.` };
  }
  const categoryScores: Record<string, number> = {};
  for (const [catName, itemNumbers] of Object.entries(HAQ_CATEGORIES)) {
    categoryScores[catName] = Math.max(...itemNumbers.map((n) => responses[n - 1]));
  }
  const sum = Object.values(categoryScores).reduce((a, b) => a + b, 0);
  const total = Math.round((sum / 8) * 100) / 100;
  return buildResult(HAQ_DI, total, { categoryScores });
}

// ── PROMIS Global-10 ─────────────────────────────────────────────────────────

const PROMIS_EXCELLENT_POOR: ResponseOption[] = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Fair" },
  { value: 1, label: "Poor" },
];

const PROMIS_NOT_AT_ALL_COMPLETELY: ResponseOption[] = [
  { value: 5, label: "Not at all" },
  { value: 4, label: "A little" },
  { value: 3, label: "Somewhat" },
  { value: 2, label: "Quite a bit" },
  { value: 1, label: "Very much" },
];

const PROMIS_NEVER_ALWAYS: ResponseOption[] = [
  { value: 5, label: "Never" },
  { value: 4, label: "Rarely" },
  { value: 3, label: "Sometimes" },
  { value: 2, label: "Often" },
  { value: 1, label: "Always" },
];

const PROMIS_10: Instrument = {
  id: "promis10",
  name: "PROMIS Global Health-10",
  abbreviation: "PROMIS-10",
  description:
    "A 10-item measure of global physical and mental health from the " +
    "Patient-Reported Outcomes Measurement Information System (PROMIS). " +
    "Yields two summary scores: Global Physical Health (GPH) and " +
    "Global Mental Health (GMH).",
  domain: "General Health",
  conditions: ["Any health condition", "Chronic disease monitoring", "General wellness"],
  items: [
    { number: 1, text: "In general, would you say your health is...", options: PROMIS_EXCELLENT_POOR },
    { number: 2, text: "In general, would you say your quality of life is...", options: PROMIS_EXCELLENT_POOR },
    { number: 3, text: "In general, how would you rate your physical health?", options: PROMIS_EXCELLENT_POOR },
    { number: 4, text: "In general, how would you rate your mental health, including your mood and your ability to think?", options: PROMIS_EXCELLENT_POOR },
    { number: 5, text: "In general, how would you rate your satisfaction with your social activities and relationships?", options: PROMIS_EXCELLENT_POOR },
    { number: 6, text: "To what extent are you able to carry out your everyday physical activities such as walking, climbing stairs, carrying groceries, or moving a chair?", options: PROMIS_NOT_AT_ALL_COMPLETELY },
    { number: 7, text: "How often have you been bothered by emotional problems such as feeling anxious, depressed, or irritable?", options: PROMIS_NEVER_ALWAYS },
    {
      number: 8,
      text: "How would you rate your fatigue on average?",
      options: [
        { value: 5, label: "None" },
        { value: 4, label: "Mild" },
        { value: 3, label: "Moderate" },
        { value: 2, label: "Severe" },
        { value: 1, label: "Very severe" },
      ],
    },
    { number: 9, text: "How would you rate your pain on average? (0=no pain, 10=worst pain imaginable)", options: VAS_0_10 },
    { number: 10, text: "In general, please rate how well you carry out your usual social activities and roles (activities at work, at home, with friends, in community).", options: PROMIS_EXCELLENT_POOR },
  ],
  scoringMethod: "custom",
  scoreRanges: [
    range(10, 20, "Poor", "Poor global health", 3),
    range(21, 30, "Fair", "Fair global health", 2),
    range(31, 40, "Good", "Good global health", 1),
    range(41, 50, "Very good to excellent", "Very good to excellent global health", 0),
  ],
  icfMappings: [
    map("b130", "Energy and drive functions", "primary"),
    map("b152", "Emotional functions", "primary"),
    map("b280", "Sensation of pain", "primary"),
    map("d230", "Carrying out daily routine", "primary"),
    map("d450", "Walking", "secondary"),
    map("d455", "Moving around", "secondary"),
    map("d710", "Basic interpersonal interactions", "secondary"),
    map("d920", "Recreation and leisure", "secondary"),
  ],
  minScore: 10,
  maxScore: 50,
  recallPeriod: "7 days",
  administration: "self-report",
  completionTime: "2-4 minutes",
  references: ["Hays RD, et al. Development of physical and mental health summary scores from the PROMIS Global items. Qual Life Res. 2009;18(7):873-880."],
  rpmFrequency: "Weekly to monthly",
  notes:
    "Items 7 and 8 are reverse-coded via their option values. Item 9 (0-10 pain) " +
    "is recoded to 1-5 before summing. GPH items: 3, 6, 8, 9. GMH items: 2, 4, 5, 7. " +
    "T-score conversion tables available from PROMIS.",
};

// PROMIS subscale item assignments
const PROMIS_GPH_ITEMS = [3, 6, 8, 9]; // Global Physical Health (item 9 recoded)
const PROMIS_GMH_ITEMS = [2, 4, 5, 7]; // Global Mental Health

function scorePromis(responses: number[]): ScoreOutcome {
  if (responses.length !== 10) {
    return { error: `PROMIS-10 requires 10 responses, got ${responses.length}.` };
  }
  // Recode item 9 pain (0-10) to the 1-5 scale: 0→5, 1-3→4, 4-6→3, 7-9→2, 10→1
  const pain = responses[8];
  const recoded = [...responses];
  recoded[8] = pain === 0 ? 5 : pain <= 3 ? 4 : pain <= 6 ? 3 : pain <= 9 ? 2 : 1;
  const total = recoded.reduce((a, b) => a + b, 0);
  return buildResult(PROMIS_10, total, {
    gphRaw: PROMIS_GPH_ITEMS.reduce((sum, n) => sum + recoded[n - 1], 0),
    gmhRaw: PROMIS_GMH_ITEMS.reduce((sum, n) => sum + recoded[n - 1], 0),
  });
}

// ── CAT (COPD Assessment Test) ──────────────────────────────────────────────

const CAT_ITEMS_DATA: Array<[string, string]> = [
  ["I never cough", "I cough all the time"],
  ["I have no phlegm (mucus) in my chest at all", "My chest is completely full of phlegm (mucus)"],
  ["My chest does not feel tight at all", "My chest feels very tight"],
  ["When I walk up a hill or one flight of stairs I am not breathless", "When I walk up a hill or one flight of stairs I am very breathless"],
  ["I am not limited doing any activities at home", "I am very limited doing activities at home"],
  ["I am confident leaving my home despite my lung condition", "I am not at all confident leaving my home because of my lung condition"],
  ["I sleep soundly", "I don't sleep soundly because of my lung condition"],
  ["I have lots of energy", "I have no energy at all"],
];

const CAT_OPTIONS: ResponseOption[] = Array.from({ length: 6 }, (_, i) => ({ value: i, label: String(i) }));

const CAT: Instrument = {
  id: "cat",
  name: "COPD Assessment Test",
  abbreviation: "CAT",
  description:
    "An 8-item patient-completed questionnaire for assessing and monitoring " +
    "COPD. Each item is scored 0-5 on a semantic differential scale.",
  domain: "Respiratory",
  conditions: ["Chronic obstructive pulmonary disease", "Chronic bronchitis", "Emphysema"],
  items: CAT_ITEMS_DATA.map(([left, right], i) => ({
    number: i + 1,
    text: `${left} (0) ←→ (5) ${right}`,
    options: CAT_OPTIONS,
  })),
  scoringMethod: "sum",
  scoreRanges: [
    range(0, 10, "Low impact", "Low impact of COPD on daily life", 1),
    range(11, 20, "Medium impact", "Medium impact; some limitations", 2),
    range(21, 30, "High impact", "High impact; significant limitations", 3),
    range(31, 40, "Very high impact", "Very high impact; severely limited", 4),
  ],
  icfMappings: [
    map("b440", "Respiration functions", "primary"),
    map("b450", "Additional respiratory functions (cough)", "primary"),
    map("b455", "Exercise tolerance functions", "primary"),
    map("b134", "Sleep functions", "secondary"),
    map("b130", "Energy and drive functions", "primary"),
    map("d450", "Walking", "secondary"),
    map("d640", "Doing housework", "secondary"),
    map("d910", "Community life", "related"),
  ],
  minScore: 0,
  maxScore: 40,
  recallPeriod: "Current",
  administration: "self-report",
  completionTime: "2-3 minutes",
  references: ["Jones PW, et al. Development and first validation of the COPD Assessment Test. Eur Respir J. 2009;34(3):648-654."],
  rpmFrequency: "Weekly to monthly",
};

// ── ODI (Oswestry Disability Index) ─────────────────────────────────────────

const ODI_PAIN_OPTS: ResponseOption[] = [
  { value: 0, label: "I have no pain at the moment" },
  { value: 1, label: "The pain is very mild at the moment" },
  { value: 2, label: "The pain is moderate at the moment" },
  { value: 3, label: "The pain is fairly severe at the moment" },
  { value: 4, label: "The pain is very severe at the moment" },
  { value: 5, label: "The pain is the worst imaginable at the moment" },
];

const ODI_GENERIC_OPTS: ResponseOption[] = [
  { value: 0, label: "No difficulty / normal" },
  { value: 1, label: "Slight limitation" },
  { value: 2, label: "Moderate limitation" },
  { value: 3, label: "Fairly significant limitation" },
  { value: 4, label: "Severely limited" },
  { value: 5, label: "Completely unable / worst" },
];

const ODI: Instrument = {
  id: "odi",
  name: "Oswestry Disability Index",
  abbreviation: "ODI",
  description:
    "A 10-item questionnaire measuring the impact of low back pain on daily " +
    "functioning. Each section scored 0-5; total as percentage of maximum. " +
    "The gold standard for low back pain functional assessment.",
  domain: "Pain / Musculoskeletal",
  conditions: ["Low back pain", "Lumbar disc disease", "Spinal stenosis", "Post-spinal surgery"],
  items: [
    { number: 1, text: "Pain intensity", options: ODI_PAIN_OPTS },
    { number: 2, text: "Personal care (washing, dressing)", options: ODI_GENERIC_OPTS },
    { number: 3, text: "Lifting", options: ODI_GENERIC_OPTS },
    { number: 4, text: "Walking", options: ODI_GENERIC_OPTS },
    { number: 5, text: "Sitting", options: ODI_GENERIC_OPTS },
    { number: 6, text: "Standing", options: ODI_GENERIC_OPTS },
    { number: 7, text: "Sleeping", options: ODI_GENERIC_OPTS },
    { number: 8, text: "Social life / sex life", options: ODI_GENERIC_OPTS },
    { number: 9, text: "Travelling", options: ODI_GENERIC_OPTS },
    { number: 10, text: "Employment / homemaking", options: ODI_GENERIC_OPTS },
  ],
  scoringMethod: "custom",
  scoreRanges: [
    range(0, 20, "Minimal disability", "Can cope with most living activities; usually no treatment needed beyond advice", 0),
    range(21, 40, "Moderate disability", "More difficulty with daily activities; conservative treatment", 1),
    range(41, 60, "Severe disability", "Pain is a major problem; detailed investigation required", 2),
    range(61, 80, "Crippled", "Back pain impinges on all aspects of daily living", 3),
    range(81, 100, "Bed-bound / exaggerating", "Bed-bound or symptoms are exaggerated", 4),
  ],
  icfMappings: [
    map("b280", "Sensation of pain", "primary"),
    map("b28013", "Pain in back", "primary"),
    map("b710", "Mobility of joint functions", "primary"),
    map("b134", "Sleep functions", "secondary"),
    map("d410", "Changing basic body position", "primary"),
    map("d430", "Lifting and carrying objects", "primary"),
    map("d450", "Walking", "primary"),
    map("d475", "Driving", "secondary"),
    map("d510", "Washing oneself", "secondary"),
    map("d540", "Dressing", "secondary"),
    map("d850", "Remunerative employment", "secondary"),
    map("d920", "Recreation and leisure", "related"),
  ],
  minScore: 0,
  maxScore: 100,
  recallPeriod: "Current / today",
  administration: "self-report",
  completionTime: "3-5 minutes",
  references: ["Fairbank JC, Pynsent PB. The Oswestry Disability Index. Spine. 2000;25(22):2940-2953."],
  rpmFrequency: "Biweekly to monthly",
  notes: "Score = (sum of item scores / (5 × number of answered sections)) × 100. If a section is not answered, it is excluded.",
};

function scoreOdi(responses: number[]): ScoreOutcome {
  if (responses.length !== 10) {
    return { error: `ODI requires 10 responses, got ${responses.length}.` };
  }
  const sum = responses.reduce((a, b) => a + b, 0);
  const total = Math.round((sum / 50) * 100 * 10) / 10;
  return buildResult(ODI, total, { unit: "%" });
}

// ── NRS Pain ─────────────────────────────────────────────────────────────────

const NRS_PAIN: Instrument = {
  id: "nrs_pain",
  name: "Numeric Rating Scale for Pain",
  abbreviation: "NRS Pain",
  description:
    "A single-item 0-10 numeric scale for rapid pain intensity assessment. " +
    "The most commonly used pain measure in RPM and clinical practice.",
  domain: "Pain",
  conditions: ["Any pain condition", "Chronic pain", "Post-surgical pain", "Cancer pain"],
  items: [
    { number: 1, text: "Rate your pain on a scale of 0 to 10, where 0 is no pain and 10 is the worst pain imaginable.", options: VAS_0_10 },
  ],
  scoringMethod: "sum",
  scoreRanges: [
    range(0, 0, "No pain", "No pain", 0),
    range(1, 3, "Mild", "Mild pain", 1),
    range(4, 6, "Moderate", "Moderate pain", 2),
    range(7, 9, "Severe", "Severe pain", 3),
    range(10, 10, "Worst possible", "Worst possible pain", 4),
  ],
  icfMappings: [
    map("b280", "Sensation of pain", "primary"),
    map("b28010", "Pain in head and neck", "related"),
    map("b28011", "Pain in chest", "related"),
    map("b28012", "Pain in stomach or abdomen", "related"),
    map("b28013", "Pain in back", "related"),
    map("b28014", "Pain in upper limb", "related"),
    map("b28015", "Pain in lower limb", "related"),
    map("b28016", "Pain in joints", "related"),
  ],
  minScore: 0,
  maxScore: 10,
  recallPeriod: "Current / past 24 hours",
  administration: "self-report",
  completionTime: "< 1 minute",
  references: ["Hawker GA, et al. Measures of adult pain. Arthritis Care Res. 2011;63(S11):S240-S252."],
  rpmFrequency: "Daily to weekly",
};

// ── Falls Efficacy Scale - International (Short) ────────────────────────────

const FES_OPTIONS: ResponseOption[] = [
  { value: 1, label: "Not at all concerned" },
  { value: 2, label: "Somewhat concerned" },
  { value: 3, label: "Fairly concerned" },
  { value: 4, label: "Very concerned" },
];

const FES_I_SHORT: Instrument = {
  id: "fes_i_short",
  name: "Falls Efficacy Scale - International (Short Form)",
  abbreviation: "Short FES-I",
  description:
    "A 7-item measure of fear of falling / concern about falls during " +
    "daily activities. Used in geriatric and rehabilitation RPM programs.",
  domain: "Geriatrics / Falls",
  conditions: ["Fall risk", "Balance disorders", "Geriatric assessment", "Post-hip fracture"],
  items: [
    { number: 1, text: "Getting dressed or undressed", options: FES_OPTIONS },
    { number: 2, text: "Taking a bath or shower", options: FES_OPTIONS },
    { number: 3, text: "Getting in or out of a chair", options: FES_OPTIONS },
    { number: 4, text: "Going up or down stairs", options: FES_OPTIONS },
    { number: 5, text: "Reaching for something above your head or on the ground", options: FES_OPTIONS },
    { number: 6, text: "Walking up or down a slope", options: FES_OPTIONS },
    { number: 7, text: "Going out to a social event", options: FES_OPTIONS },
  ],
  scoringMethod: "sum",
  scoreRanges: [
    range(7, 8, "Low concern", "Low concern about falling", 0),
    range(9, 13, "Moderate concern", "Moderate concern about falling", 1),
    range(14, 21, "High concern", "High concern about falling; fall risk assessment indicated", 2),
    range(22, 28, "Severe concern", "Severe concern; activity avoidance likely", 3),
  ],
  icfMappings: [
    map("b235", "Vestibular functions", "secondary"),
    map("b755", "Involuntary movement reaction functions", "primary"),
    map("d410", "Changing basic body position", "primary"),
    map("d450", "Walking", "primary"),
    map("d455", "Moving around", "primary"),
    map("d510", "Washing oneself", "secondary"),
    map("d540", "Dressing", "secondary"),
    map("d920", "Recreation and leisure", "related"),
    map("e120", "Products and technology for personal indoor and outdoor mobility and transportation", "related"),
  ],
  minScore: 7,
  maxScore: 28,
  recallPeriod: "Current",
  administration: "self-report",
  completionTime: "2-3 minutes",
  references: ["Kempen GIJM, et al. The Short FES-I: a shortened version of the Falls Efficacy Scale-International. Age Ageing. 2008;37(1):45-50."],
  rpmFrequency: "Monthly",
};

// ═════════════════════════════════════════════════════════════════════════════
// Instrument Registry
// ═════════════════════════════════════════════════════════════════════════════

// Attach dedicated scorers to instruments whose scoring is not a plain sum/mean
SLEDAI2K.scorer = scoreSledai;
HAQ_DI.scorer = scoreHaq;
ODI.scorer = scoreOdi;
PROMIS_10.scorer = scorePromis;

export const INSTRUMENTS: Record<string, Instrument> = Object.fromEntries(
  [GAD7, PHQ9, RADAI5, SLEDAI2K, WHODAS2_12, HAQ_DI, PROMIS_10, CAT, ODI, NRS_PAIN, FES_I_SHORT].map(
    (inst) => [inst.id, inst]
  )
);

// Lookup by abbreviation or name (case-insensitive)
const ALIAS_MAP: Record<string, string> = {};
for (const inst of Object.values(INSTRUMENTS)) {
  ALIAS_MAP[inst.id] = inst.id;
  ALIAS_MAP[inst.abbreviation.toLowerCase()] = inst.id;
  ALIAS_MAP[inst.abbreviation.toLowerCase().replace(/-/g, "")] = inst.id;
  ALIAS_MAP[inst.abbreviation.toLowerCase().replace(/-/g, " ")] = inst.id;
  ALIAS_MAP[inst.name.toLowerCase()] = inst.id;
}
// Common shorthand aliases
Object.assign(ALIAS_MAP, {
  "gad": "gad7", "gad 7": "gad7",
  "phq": "phq9", "phq 9": "phq9",
  "radai": "radai5", "radai 5": "radai5",
  "sledai": "sledai2k", "sledai 2k": "sledai2k",
  "whodas": "whodas2_12", "whodas 2.0": "whodas2_12", "whodas2": "whodas2_12", "whodas 12": "whodas2_12",
  "haq": "haq_di", "haq di": "haq_di",
  "promis": "promis10", "promis 10": "promis10", "promis global": "promis10",
  "copd assessment test": "cat",
  "oswestry": "odi",
  "nrs": "nrs_pain", "pain nrs": "nrs_pain", "pain scale": "nrs_pain",
  "fes": "fes_i_short", "fes-i": "fes_i_short", "falls": "fes_i_short", "falls efficacy": "fes_i_short",
});

export function resolveInstrument(name: string): Instrument | null {
  const key = name.trim().toLowerCase();
  const instId = ALIAS_MAP[key];
  if (instId) {
    return INSTRUMENTS[instId] || null;
  }
  // Fuzzy: check if any alias starts with the input
  for (const [alias, iid] of Object.entries(ALIAS_MAP)) {
    if (alias.startsWith(key)) {
      return INSTRUMENTS[iid] || null;
    }
  }
  return null;
}

export function scoreInstrument(name: string, responses: number[]): ScoreOutcome {
  const inst = resolveInstrument(name);
  if (!inst) {
    return { error: `Unknown instrument '${name}'. Use {"action": "instruments"} to see available instruments.` };
  }

  if (inst.scorer) {
    return inst.scorer(responses.map((r) => Math.trunc(r)));
  }

  return scoreGeneric(inst, responses);
}

export const DOMAINS: string[] = [...new Set(Object.values(INSTRUMENTS).map((i) => i.domain))].sort();
