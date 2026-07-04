import { describe, it, expect } from "vitest";
import { parseIcfCode, explainQualifier, scaleMeaning, GENERIC_SCALE } from "../src/qualifiers";

describe("parseIcfCode — base codes", () => {
  it("parses an unqualified code", () => {
    const p = parseIcfCode("b280");
    expect(p.error).toBeNull();
    expect(p.baseCode).toBe("b280");
    expect(p.component).toBe("b");
    expect(p.componentName).toBe("Body Functions");
    expect(p.level).toBe("Category (3rd level)");
    expect(p.qualifiers).toEqual([]);
  });

  it("normalizes case and whitespace", () => {
    const p = parseIcfCode("  D450 ");
    expect(p.baseCode).toBe("d450");
    expect(p.componentName).toBe("Activities and Participation");
  });

  it("identifies hierarchy levels by digit count", () => {
    expect(parseIcfCode("b2").level).toBe("Chapter (1st level)");
    expect(parseIcfCode("b28").level).toBe("Block (2nd level)");
    expect(parseIcfCode("b280").level).toBe("Category (3rd level)");
    expect(parseIcfCode("b2801").level).toBe("Subcategory (4th level)");
  });

  it("rejects malformed codes with a format error", () => {
    for (const bad of ["x123", "b", "450", "b28001", "d450..2", "d450-2"]) {
      const p = parseIcfCode(bad);
      expect(p.baseCode).toBeUndefined();
      expect(p.error).toContain("does not match ICF code format");
    }
  });
});

describe("parseIcfCode — Body Functions (b)", () => {
  it("parses a single impairment qualifier", () => {
    const p = parseIcfCode("b280.2");
    expect(p.error).toBeNull();
    expect(p.qualifiers).toEqual([
      { name: "Extent of impairment", value: 2, meaning: "Moderate problem (25-49%)" },
    ]);
  });

  it("rejects more than one qualifier digit", () => {
    const p = parseIcfCode("b280.23");
    expect(p.baseCode).toBe("b280");
    expect(p.error).toContain("Body Functions (b) use 1 qualifier");
  });
});

describe("parseIcfCode — Body Structures (s)", () => {
  it("parses extent, nature, and location", () => {
    const p = parseIcfCode("s730.312");
    expect(p.error).toBeNull();
    expect(p.qualifiers).toEqual([
      { name: "Extent of impairment", value: 3, meaning: "Severe problem (50-95%)" },
      { name: "Nature of change", value: 1, meaning: "Total absence" },
      { name: "Location", value: 2, meaning: "Left" },
    ]);
  });

  it("accepts partial qualifiers (1 or 2 digits)", () => {
    expect(parseIcfCode("s730.3").qualifiers).toHaveLength(1);
    expect(parseIcfCode("s730.31").qualifiers).toHaveLength(2);
  });

  it("rejects a 4th digit", () => {
    const p = parseIcfCode("s730.3120");
    expect(p.error).toContain("up to 3 qualifiers");
  });
});

describe("parseIcfCode — Activities & Participation (d)", () => {
  it("parses performance and capacity", () => {
    const p = parseIcfCode("d450.23");
    expect(p.error).toBeNull();
    expect(p.qualifiers).toEqual([
      { name: "Performance", value: 2, meaning: "Moderate problem (25-49%)" },
      { name: "Capacity", value: 3, meaning: "Severe problem (50-95%)" },
    ]);
  });

  it("accepts a lone performance qualifier", () => {
    const p = parseIcfCode("d450.2");
    expect(p.qualifiers).toEqual([
      { name: "Performance", value: 2, meaning: "Moderate problem (25-49%)" },
    ]);
  });

  it("rejects a 3rd digit", () => {
    const p = parseIcfCode("d450.231");
    expect(p.error).toContain("use up to 2 qualifiers");
  });
});

describe("parseIcfCode — Environmental Factors (e)", () => {
  it("parses a barrier (dot separator)", () => {
    const p = parseIcfCode("e120.2");
    expect(p.isFacilitator).toBe(false);
    expect(p.qualifiers).toEqual([
      { name: "Barrier", value: 2, meaning: "Moderate barrier (25-49%)" },
    ]);
  });

  it("parses a facilitator (plus separator)", () => {
    const p = parseIcfCode("e120+3");
    expect(p.isFacilitator).toBe(true);
    expect(p.qualifiers).toEqual([
      { name: "Facilitator", value: 3, meaning: "Substantial facilitator (50-95%)" },
    ]);
  });

  it("rejects two qualifier digits", () => {
    const p = parseIcfCode("e120.23");
    expect(p.error).toContain("Environmental Factors (e) use 1 qualifier");
  });
});

describe("parseIcfCode — not-specified / not-applicable values", () => {
  it("handles 8 and 9 without a percentage suffix", () => {
    expect(parseIcfCode("b280.8").qualifiers[0].meaning).toBe("Not specified");
    expect(parseIcfCode("b280.9").qualifiers[0].meaning).toBe("Not applicable");
  });

  it("reports unknown scale values", () => {
    expect(parseIcfCode("b280.5").qualifiers[0].meaning).toBe("Unknown");
  });
});

describe("scaleMeaning", () => {
  it("formats tuple entries and hides N/A percentages", () => {
    expect(scaleMeaning(GENERIC_SCALE, 2)).toBe("Moderate problem (25-49%)");
    expect(scaleMeaning(GENERIC_SCALE, 8)).toBe("Not specified");
    expect(scaleMeaning(GENERIC_SCALE, 7)).toBe("Unknown");
  });
});

describe("explainQualifier", () => {
  it("defaults to the generic scale", () => {
    const out = explainQualifier();
    expect(out).toContain("Generic Severity Scale");
    expect(out).toContain("Moderate problem");
  });

  it("explains a specific generic value", () => {
    const out = explainQualifier("generic", 2);
    expect(out).toContain("Qualifier 2: Moderate problem");
    expect(out).toContain("d450.2");
  });

  it("uses a b-code example for body functions", () => {
    expect(explainQualifier("b", 3)).toContain("b280.3");
  });

  it("rejects invalid qualifier values", () => {
    expect(explainQualifier("generic", 5)).toContain("Invalid qualifier value");
  });

  it("describes all three body structure qualifiers", () => {
    const out = explainQualifier("s");
    expect(out).toContain("3 Qualifiers");
    expect(out).toContain("Nature of Change");
    expect(out).toContain("Location");
  });

  it("describes performance vs capacity for d", () => {
    const out = explainQualifier("d");
    expect(out).toContain("Performance");
    expect(out).toContain("Capacity");
  });

  it("describes barriers and facilitators for e", () => {
    const out = explainQualifier("e");
    expect(out).toContain("Barrier Scale");
    expect(out).toContain("Facilitator Scale");
    expect(out).toContain("e120+3");
  });

  it("rejects unknown components", () => {
    expect(explainQualifier("z")).toContain("Unknown component 'z'");
  });
});
