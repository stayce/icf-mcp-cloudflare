/**
 * ICF qualifier scales and qualified-code parsing.
 *
 * Pure logic — no WHO API dependency. Ported from the Python reference
 * implementation (icf-mcp-server v0.2.0).
 */

// Component names
export const COMPONENTS: Record<string, string> = {
  b: "Body Functions",
  s: "Body Structures",
  d: "Activities and Participation",
  e: "Environmental Factors",
};

// Hierarchy level names (keyed by digit count of the base code)
export const LEVELS: Record<number, string> = {
  1: "Chapter (1st level)",
  2: "Block (2nd level)",
  3: "Category (3rd level)",
  4: "Subcategory (4th level)",
};

// Generic severity scale (used by b, s-1st, d-performance, d-capacity)
// value → [label, percentage range, description]
export const GENERIC_SCALE: Record<number, [string, string, string]> = {
  0: ["No problem", "0-4%", "None, absent, negligible"],
  1: ["Mild problem", "5-24%", "Slight, low"],
  2: ["Moderate problem", "25-49%", "Medium, fair"],
  3: ["Severe problem", "50-95%", "High, extreme"],
  4: ["Complete problem", "96-100%", "Total"],
  8: ["Not specified", "N/A", "Insufficient information to specify severity"],
  9: ["Not applicable", "N/A", "Inappropriate to apply this code"],
};

// Body Structures — 2nd qualifier: nature of change
export const NATURE_OF_CHANGE: Record<number, string> = {
  0: "No change in structure",
  1: "Total absence",
  2: "Partial absence",
  3: "Additional part",
  4: "Aberrant dimensions",
  5: "Discontinuity",
  6: "Deviating position",
  7: "Qualitative changes in structure",
  8: "Not specified",
  9: "Not applicable",
};

// Body Structures — 3rd qualifier: location
export const LOCATION: Record<number, string> = {
  0: "More than one region",
  1: "Right",
  2: "Left",
  3: "Both sides",
  4: "Front",
  5: "Back",
  6: "Proximal",
  7: "Distal",
  8: "Not specified",
  9: "Not applicable",
};

// Environmental Factors — barrier scale: value → [label, percentage range]
export const BARRIER_SCALE: Record<number, [string, string]> = {
  0: ["No barrier", "0-4%"],
  1: ["Mild barrier", "5-24%"],
  2: ["Moderate barrier", "25-49%"],
  3: ["Severe barrier", "50-95%"],
  4: ["Complete barrier", "96-100%"],
  8: ["Not specified", "N/A"],
  9: ["Not applicable", "N/A"],
};

// Environmental Factors — facilitator scale: value → [label, percentage range]
export const FACILITATOR_SCALE: Record<number, [string, string]> = {
  0: ["No facilitator", "0-4%"],
  1: ["Mild facilitator", "5-24%"],
  2: ["Moderate facilitator", "25-49%"],
  3: ["Substantial facilitator", "50-95%"],
  4: ["Complete facilitator", "96-100%"],
  8: ["Not specified", "N/A"],
  9: ["Not applicable", "N/A"],
};

type Scale = Record<number, string | [string, string] | [string, string, string]>;

/** Render a qualifier scale entry as 'Label (pct)' or a bare label. */
export function scaleMeaning(scale: Scale, value: number): string {
  const entry = scale[value];
  if (entry === undefined) {
    return "Unknown";
  }
  if (Array.isArray(entry)) {
    const [label, pct] = entry;
    return pct !== "N/A" ? `${label} (${pct})` : label;
  }
  return entry;
}

export interface ParsedQualifier {
  name: string;
  value: number;
  meaning: string;
}

export interface ParsedICFCode {
  baseCode?: string;
  component?: string;
  componentName?: string;
  digits?: string;
  level?: string;
  qualifierStr?: string;
  separator?: string;
  isFacilitator?: boolean;
  qualifiers: ParsedQualifier[];
  // Set for qualifier-count errors (baseCode still present) and for
  // format errors (no baseCode at all).
  error: string | null;
}

/**
 * Parse a raw ICF code string (with or without qualifiers) into its components.
 *
 * Supports formats: b280, d450.2, d450.23, s730.312, e120.2, e120+3
 */
export function parseIcfCode(raw: string): ParsedICFCode {
  const trimmed = raw.trim();

  // Full pattern: component + digits + optional separator + qualifier digits
  // Separators: "." for barriers/impairments, "+" for facilitators
  const match = trimmed.match(/^([bBsSdDeE])(\d{1,4})(?:([.+])(\d+))?$/);

  if (!match) {
    return {
      qualifiers: [],
      error:
        `'${trimmed}' does not match ICF code format.\n\n` +
        "**Base code:** `[bsde]` + 1-4 digits (e.g., b280, d450)\n" +
        "**With qualifiers:** code + `.` or `+` + qualifier digits\n" +
        "  - b280.2 (body function, moderate impairment)\n" +
        "  - d450.23 (activity, performance=2, capacity=3)\n" +
        "  - s730.312 (structure, extent=3, nature=1, location=2)\n" +
        "  - e120.2 (environment, moderate barrier)\n" +
        "  - e120+3 (environment, substantial facilitator)",
    };
  }

  const component = match[1].toLowerCase();
  const digits = match[2];
  const separator = match[3]; // "." or "+" or undefined
  const qualifierStr = match[4]; // "2", "23", "312", or undefined

  const result: ParsedICFCode = {
    baseCode: `${component}${digits}`,
    component,
    componentName: COMPONENTS[component],
    digits,
    level: LEVELS[digits.length] || "Unknown",
    qualifierStr,
    separator,
    isFacilitator: separator === "+",
    qualifiers: [],
    error: null,
  };

  if (!qualifierStr) {
    return result;
  }

  // Parse qualifiers based on component
  const qdigits = [...qualifierStr].map(Number);

  if (component === "b") {
    // Body Functions: 1 qualifier (extent of impairment)
    if (qdigits.length > 1) {
      result.error =
        `Body Functions (b) use 1 qualifier: extent of impairment. ` +
        `Got ${qdigits.length} digits ('${qualifierStr}').`;
      return result;
    }
    result.qualifiers = [
      { name: "Extent of impairment", value: qdigits[0], meaning: scaleMeaning(GENERIC_SCALE, qdigits[0]) },
    ];
  } else if (component === "s") {
    // Body Structures: up to 3 qualifiers
    if (qdigits.length > 3) {
      result.error =
        `Body Structures (s) use up to 3 qualifiers. ` +
        `Got ${qdigits.length} digits ('${qualifierStr}').`;
      return result;
    }
    const scales: Array<[string, Scale]> = [
      ["Extent of impairment", GENERIC_SCALE],
      ["Nature of change", NATURE_OF_CHANGE],
      ["Location", LOCATION],
    ];
    result.qualifiers = qdigits.map((val, i) => {
      const [name, scale] = scales[i];
      return { name, value: val, meaning: scaleMeaning(scale, val) };
    });
  } else if (component === "d") {
    // Activities & Participation: up to 2 qualifiers
    if (qdigits.length > 2) {
      result.error =
        `Activities & Participation (d) use up to 2 qualifiers. ` +
        `Got ${qdigits.length} digits ('${qualifierStr}').`;
      return result;
    }
    const names = ["Performance", "Capacity"];
    result.qualifiers = qdigits.map((val, i) => ({
      name: names[i],
      value: val,
      meaning: scaleMeaning(GENERIC_SCALE, val),
    }));
  } else if (component === "e") {
    // Environmental Factors: 1 qualifier (barrier or facilitator)
    if (qdigits.length > 1) {
      result.error =
        `Environmental Factors (e) use 1 qualifier. ` +
        `Got ${qdigits.length} digits ('${qualifierStr}').`;
      return result;
    }
    const scale = result.isFacilitator ? FACILITATOR_SCALE : BARRIER_SCALE;
    const label = result.isFacilitator ? "Facilitator" : "Barrier";
    result.qualifiers = [
      { name: label, value: qdigits[0], meaning: scaleMeaning(scale, qdigits[0]) },
    ];
  }

  return result;
}

/**
 * Build the explanation text for a component's qualifier system.
 *
 * component: "generic" (default), "b", "s", "d", or "e".
 * qualifier: optional specific value to explain (generic/b only).
 */
export function explainQualifier(component: string = "generic", qualifier?: number): string {
  const comp = component.trim().toLowerCase();

  if (comp === "generic" || comp === "b") {
    const label = comp === "b" ? "Body Functions (b) — Extent of Impairment" : "Generic Severity Scale";
    if (qualifier !== undefined && qualifier !== null) {
      if (!(qualifier in GENERIC_SCALE)) {
        return `Invalid qualifier value '${qualifier}'. Valid: 0-4, 8, 9.`;
      }
      const [level, pct, desc] = GENERIC_SCALE[qualifier];
      const example = comp === "b" ? `b280.${qualifier}` : `d450.${qualifier}`;
      return (
        `**${label} — Qualifier ${qualifier}: ${level}**\n\n` +
        `- **Percentage range:** ${pct}\n` +
        `- **Description:** ${desc}\n\n` +
        `Example: ${example} means '${level.toLowerCase()}'.`
      );
    }
    const lines = [`**${label}**\n`];
    for (const [val, [level, pct, desc]] of Object.entries(GENERIC_SCALE)) {
      lines.push(`- **${val}**: ${level} (${pct}) — ${desc}`);
    }
    if (comp === "b") {
      lines.push("\nBody Functions use a single qualifier: b280.**2** = moderate impairment.");
    }
    return lines.join("\n");
  }

  if (comp === "s") {
    const lines = [
      "**Body Structures (s) — 3 Qualifiers**\n",
      "Body Structure codes use three qualifiers: `s{code}.{extent}{nature}{location}`\n",
      "Example: **s730.312** = structure of upper extremity, severe impairment (3),",
      "total absence (1), left side (2)\n",
      "### 1st Qualifier: Extent of Impairment\n",
    ];
    for (const [val, [level, pct]] of Object.entries(GENERIC_SCALE)) {
      lines.push(`- **${val}**: ${level} (${pct})`);
    }
    lines.push("\n### 2nd Qualifier: Nature of Change\n");
    for (const [val, desc] of Object.entries(NATURE_OF_CHANGE)) {
      lines.push(`- **${val}**: ${desc}`);
    }
    lines.push("\n### 3rd Qualifier: Location\n");
    for (const val of Object.keys(LOCATION)) {
      lines.push(`- **${val}**: ${LOCATION[Number(val)]}`);
    }
    return lines.join("\n");
  }

  if (comp === "d") {
    const lines = [
      "**Activities & Participation (d) — 2 Qualifiers**\n",
      "Activity/Participation codes use two qualifiers: `d{code}.{performance}{capacity}`\n",
      "- **Performance**: what a person *does* in their current environment",
      "- **Capacity**: what a person *can do* in a standardized environment\n",
      "Example: **d450.23** = walking, moderate difficulty in performance (2),",
      "severe limitation in capacity (3)\n",
      "### Both qualifiers use the standard severity scale:\n",
    ];
    for (const [val, [level, pct]] of Object.entries(GENERIC_SCALE)) {
      lines.push(`- **${val}**: ${level} (${pct})`);
    }
    return lines.join("\n");
  }

  if (comp === "e") {
    const lines = [
      "**Environmental Factors (e) — 1 Qualifier (Barrier or Facilitator)**\n",
      "Environmental codes use a single qualifier with two directions:\n",
      "- **Barriers** use a dot: `e{code}.{value}` (e.g., e120.2 = moderate barrier)",
      "- **Facilitators** use a plus: `e{code}+{value}` (e.g., e120+3 = substantial facilitator)\n",
      "### Barrier Scale (negative influence)\n",
    ];
    for (const val of Object.keys(BARRIER_SCALE)) {
      lines.push(`- **.${val}**: ${scaleMeaning(BARRIER_SCALE, Number(val))}`);
    }
    lines.push("\n### Facilitator Scale (positive influence)\n");
    for (const val of Object.keys(FACILITATOR_SCALE)) {
      lines.push(`- **+${val}**: ${scaleMeaning(FACILITATOR_SCALE, Number(val))}`);
    }
    return lines.join("\n");
  }

  return (
    `Unknown component '${component}'. Valid values:\n` +
    "- `generic`: Standard severity scale (default)\n" +
    "- `b`: Body Functions (1 qualifier)\n" +
    "- `s`: Body Structures (3 qualifiers)\n" +
    "- `d`: Activities & Participation (2 qualifiers)\n" +
    "- `e`: Environmental Factors (barrier/facilitator)"
  );
}
