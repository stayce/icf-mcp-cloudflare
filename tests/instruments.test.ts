import { describe, it, expect } from "vitest";
import {
  INSTRUMENTS,
  DOMAINS,
  resolveInstrument,
  scoreInstrument,
  ScoreResult,
} from "../src/instruments";

function ok(name: string, responses: number[]): ScoreResult {
  const result = scoreInstrument(name, responses);
  if ("error" in result) {
    throw new Error(`Expected score, got error: ${result.error}`);
  }
  return result;
}

describe("registry", () => {
  it("contains all 11 instruments", () => {
    expect(Object.keys(INSTRUMENTS)).toHaveLength(11);
    expect(Object.keys(INSTRUMENTS).sort()).toEqual([
      "cat", "fes_i_short", "gad7", "haq_di", "nrs_pain", "odi",
      "phq9", "promis10", "radai5", "sledai2k", "whodas2_12",
    ]);
  });

  it("collects sorted unique domains", () => {
    expect(DOMAINS).toEqual([...new Set(DOMAINS)].sort());
    expect(DOMAINS).toContain("Mental Health");
    expect(DOMAINS).toContain("Rheumatology");
  });
});

describe("resolveInstrument", () => {
  it("resolves ids, abbreviations, and names", () => {
    expect(resolveInstrument("gad7")?.id).toBe("gad7");
    expect(resolveInstrument("GAD-7")?.id).toBe("gad7");
    expect(resolveInstrument("Patient Health Questionnaire-9")?.id).toBe("phq9");
    expect(resolveInstrument("WHODAS 2.0")?.id).toBe("whodas2_12");
  });

  it("resolves shorthand aliases", () => {
    expect(resolveInstrument("gad")?.id).toBe("gad7");
    expect(resolveInstrument("phq")?.id).toBe("phq9");
    expect(resolveInstrument("sledai")?.id).toBe("sledai2k");
    expect(resolveInstrument("oswestry")?.id).toBe("odi");
    expect(resolveInstrument("haq")?.id).toBe("haq_di");
    expect(resolveInstrument("falls")?.id).toBe("fes_i_short");
    expect(resolveInstrument("nrs")?.id).toBe("nrs_pain");
  });

  it("resolves fuzzy prefixes and rejects unknowns", () => {
    expect(resolveInstrument("promis gl")?.id).toBe("promis10");
    expect(resolveInstrument("nonexistent-instrument")).toBeNull();
  });
});

describe("GAD-7 (sum)", () => {
  it("scores the standard vector", () => {
    const r = ok("GAD-7", [1, 2, 1, 0, 1, 2, 1]);
    expect(r.totalScore).toBe(8);
    expect(r.severity).toBe("Mild");
    expect(r.icfQualifier).toBe(1);
  });

  it("hits the extremes", () => {
    expect(ok("gad7", [0, 0, 0, 0, 0, 0, 0]).severity).toBe("Minimal");
    const max = ok("gad7", [3, 3, 3, 3, 3, 3, 3]);
    expect(max.totalScore).toBe(21);
    expect(max.severity).toBe("Severe");
    expect(max.icfQualifier).toBe(3);
  });

  it("rejects wrong response counts", () => {
    const r = scoreInstrument("gad7", [1, 2, 3]);
    expect("error" in r && r.error).toContain("Expected 7 responses");
  });
});

describe("PHQ-9 (sum)", () => {
  it("maps boundaries to severity bands", () => {
    expect(ok("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 1]).severity).toBe("Mild"); // 9
    expect(ok("phq9", [2, 1, 1, 1, 1, 1, 1, 1, 1]).severity).toBe("Moderate"); // 10
    const max = ok("phq9", [3, 3, 3, 3, 3, 3, 3, 3, 3]);
    expect(max.totalScore).toBe(27);
    expect(max.severity).toBe("Severe");
    expect(max.icfQualifier).toBe(4);
  });
});

describe("RADAI-5 (mean)", () => {
  it("averages the items", () => {
    const r = ok("radai5", [2, 3, 3, 4, 3]);
    expect(r.totalScore).toBe(3.0);
    expect(r.severity).toBe("Low");
    expect(r.icfQualifier).toBe(1);
  });

  it("classifies very high activity", () => {
    const r = ok("radai", [8, 8, 8, 8, 8]);
    expect(r.totalScore).toBe(8.0);
    expect(r.severity).toBe("Very high");
    expect(r.icfQualifier).toBe(4);
  });
});

describe("SLEDAI-2K (weighted)", () => {
  const none = new Array(24).fill(0);

  it("scores zero activity", () => {
    const r = ok("sledai", none);
    expect(r.totalScore).toBe(0);
    expect(r.severity).toBe("No activity");
    expect(r.activeDescriptors).toBe(0);
  });

  it("applies item weights (arthritis=4 + fever=1 → 5, Mild)", () => {
    const responses = [...none];
    responses[8] = 1; // item 9: arthritis, weight 4
    responses[21] = 1; // item 22: fever, weight 1
    const r = ok("sledai-2k", responses);
    expect(r.totalScore).toBe(5);
    expect(r.severity).toBe("Mild");
    expect(r.activeDescriptors).toBe(2);
    expect(r.organSystems).toMatchObject({
      musculoskeletal: true,
      constitutional: true,
      neurological: false,
      renal: false,
    });
  });

  it("sums to 105 when everything is present", () => {
    const r = ok("sledai", new Array(24).fill(1));
    expect(r.totalScore).toBe(105);
    expect(r.severity).toBe("Very high");
    expect(Object.values(r.organSystems!).every(Boolean)).toBe(true);
  });

  it("requires exactly 24 responses", () => {
    const r = scoreInstrument("sledai", [1, 0, 1]);
    expect("error" in r && r.error).toContain("24 responses");
  });
});

describe("WHODAS 2.0 (sum)", () => {
  it("scores across the bands", () => {
    expect(ok("whodas", new Array(12).fill(0)).severity).toBe("None");
    expect(ok("whodas", new Array(12).fill(1)).severity).toBe("Mild"); // 12
    expect(ok("whodas", new Array(12).fill(2)).severity).toBe("Moderate"); // 24
    const max = ok("whodas 2.0", new Array(12).fill(4));
    expect(max.totalScore).toBe(48);
    expect(max.severity).toBe("Extreme");
    expect(max.icfQualifier).toBe(4);
  });
});

describe("HAQ-DI (category max, mean of 8)", () => {
  it("takes the max per category and averages", () => {
    // All zeros except item 5 (Eating category) = 3 → categories: 0×7 + 3 → 3/8 = 0.38
    const responses = new Array(20).fill(0);
    responses[4] = 3;
    const r = ok("haq", responses);
    expect(r.totalScore).toBe(0.38);
    expect(r.severity).toBe("Mild difficulty");
    expect(r.categoryScores).toMatchObject({ Eating: 3, Walking: 0 });
  });

  it("uniform responses score as that value", () => {
    const r = ok("haq-di", new Array(20).fill(1));
    expect(r.totalScore).toBe(1.0);
    expect(r.severity).toBe("Moderate difficulty");
    const max = ok("haq", new Array(20).fill(3));
    expect(max.totalScore).toBe(3.0);
    expect(max.severity).toBe("Very severe");
  });
});

describe("PROMIS-10 (pain recode + subscales)", () => {
  it("recodes item 9 pain 0 → 5", () => {
    const r = ok("promis", [3, 3, 3, 3, 3, 3, 3, 3, 0, 3]);
    expect(r.totalScore).toBe(32); // 9×3 + 5
    expect(r.severity).toBe("Good");
    expect(r.gphRaw).toBe(14); // items 3,6,8 = 3 each + recoded 5
    expect(r.gmhRaw).toBe(12); // items 2,4,5,7 = 3 each
  });

  it("recodes worst pain 10 → 1", () => {
    const r = ok("promis-10", [1, 1, 1, 1, 1, 1, 1, 1, 10, 1]);
    expect(r.totalScore).toBe(10); // 9×1 + 1
    expect(r.severity).toBe("Poor");
    expect(r.icfQualifier).toBe(3);
  });

  it("recodes pain bands (1-3→4, 4-6→3, 7-9→2)", () => {
    expect(ok("promis", [1, 1, 1, 1, 1, 1, 1, 1, 2, 1]).totalScore).toBe(13);
    expect(ok("promis", [1, 1, 1, 1, 1, 1, 1, 1, 5, 1]).totalScore).toBe(12);
    expect(ok("promis", [1, 1, 1, 1, 1, 1, 1, 1, 8, 1]).totalScore).toBe(11);
  });
});

describe("CAT (sum)", () => {
  it("scores impact bands", () => {
    expect(ok("cat", new Array(8).fill(1)).severity).toBe("Low impact"); // 8
    expect(ok("CAT", new Array(8).fill(2)).severity).toBe("Medium impact"); // 16
    const max = ok("copd assessment test", new Array(8).fill(5));
    expect(max.totalScore).toBe(40);
    expect(max.severity).toBe("Very high impact");
  });
});

describe("ODI (percentage)", () => {
  it("converts the raw sum to a percentage", () => {
    const r = ok("odi", [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(r.totalScore).toBe(20); // 10/50 × 100
    expect(r.severity).toBe("Minimal disability");
    expect(r.unit).toBe("%");
  });

  it("scores the maximum", () => {
    const r = ok("oswestry", new Array(10).fill(5));
    expect(r.totalScore).toBe(100);
    expect(r.severity).toBe("Bed-bound / exaggerating");
    expect(r.icfQualifier).toBe(4);
  });
});

describe("NRS Pain (single item)", () => {
  it("maps values to severity", () => {
    expect(ok("nrs", [0]).severity).toBe("No pain");
    expect(ok("nrs", [2]).severity).toBe("Mild");
    expect(ok("nrs", [5]).severity).toBe("Moderate");
    const severe = ok("pain scale", [7]);
    expect(severe.severity).toBe("Severe");
    expect(severe.icfQualifier).toBe(3);
    expect(ok("nrs", [10]).severity).toBe("Worst possible");
  });
});

describe("Short FES-I (sum, min 7)", () => {
  it("scores concern bands", () => {
    expect(ok("fes", new Array(7).fill(1)).severity).toBe("Low concern"); // 7
    expect(ok("fes-i", new Array(7).fill(2)).severity).toBe("High concern"); // 14
    const max = ok("falls", new Array(7).fill(4));
    expect(max.totalScore).toBe(28);
    expect(max.severity).toBe("Severe concern");
  });
});

describe("scoreInstrument error handling", () => {
  it("rejects unknown instruments", () => {
    const r = scoreInstrument("bogus-xyz", [1]);
    expect("error" in r && r.error).toContain("Unknown instrument");
  });
});
