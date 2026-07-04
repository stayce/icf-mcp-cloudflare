/**
 * ICF MCP Server - Action Handlers
 */

import { WHOICFClient, ICFEntity } from "./who-client";
import { ToolResult, ICFParamsType } from "./types";
import {
  COMPONENTS,
  GENERIC_SCALE,
  parseIcfCode,
  explainQualifier,
} from "./qualifiers";
import * as inst from "./instruments";

/**
 * Format an ICF entity for display
 */
function formatEntity(entity: ICFEntity): string {
  const lines: string[] = [`**${entity.code}**: ${entity.title}`];

  if (entity.definition) {
    lines.push(`\n**Definition:** ${entity.definition}`);
  }

  if (entity.inclusions && entity.inclusions.length > 0) {
    lines.push("\n**Includes:**");
    for (const inc of entity.inclusions) {
      lines.push(`  - ${inc}`);
    }
  }

  if (entity.exclusions && entity.exclusions.length > 0) {
    lines.push("\n**Excludes:**");
    for (const exc of entity.exclusions) {
      lines.push(`  - ${exc}`);
    }
  }

  return lines.join("\n");
}

function text(body: string, isError = false): ToolResult {
  return { content: [{ type: "text", text: body }], ...(isError ? { isError: true } : {}) };
}

/**
 * Main action dispatcher
 */
export async function handleAction(
  params: ICFParamsType,
  client: WHOICFClient
): Promise<ToolResult> {
  try {
    switch (params.action) {
      case "lookup":
        if (!params.code) throw new Error("code required for lookup");
        return await handleLookup(params.code, client);

      case "search":
        if (!params.query) throw new Error("query required for search");
        return await handleSearch(params.query, params.max_results || 10, client);

      case "browse":
        if (!params.category) throw new Error("category required for browse");
        return await handleBrowse(params.category, client);

      case "children":
        if (!params.code) throw new Error("code required for children");
        return await handleChildren(params.code, client);

      case "parent":
        if (!params.code) throw new Error("code required for parent");
        return await handleParent(params.code, client);

      case "siblings":
        if (!params.code) throw new Error("code required for siblings");
        return await handleSiblings(params.code, client);

      case "chain":
        if (!params.code) throw new Error("code required for chain");
        return await handleChain(params.code, client);

      case "profile":
        if (!params.codes || params.codes.length === 0) {
          throw new Error('codes required for profile (e.g., {"action": "profile", "codes": ["b280", "d450"]})');
        }
        return await handleProfile(params.codes, client);

      case "qualifier":
        return handleQualifier(params.component, params.qualifier);

      case "validate":
        if (!params.code) throw new Error("code required for validate");
        return await handleValidate(params.code, client);

      case "parse":
        if (!params.code) throw new Error("code required for parse");
        return await handleParse(params.code, client);

      case "instruments":
        return handleInstruments(params.domain);

      case "instrument":
        if (!params.name) throw new Error("name required for instrument");
        return handleInstrumentDetails(params.name);

      case "score":
        if (!params.name) throw new Error("name required for score");
        if (!params.responses) throw new Error("responses required for score");
        return handleScore(params.name, params.responses);

      case "suggest":
        return handleSuggest(params.condition, params.code, params.domain);

      case "mapping":
        if (!params.name) throw new Error("name required for mapping");
        return handleMapping(params.name);

      case "overview":
        return handleOverview();

      case "api":
        if (!params.path) throw new Error("path required for api");
        return await handleApi(params.path, client);

      case "help":
        return handleHelp();

      default:
        return text(`Unknown action: ${params.action}`, true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return text(`Error: ${message}`, true);
  }
}

async function handleLookup(code: string, client: WHOICFClient): Promise<ToolResult> {
  const entity = await client.getEntityByCode(code);

  if (!entity) {
    return text(`ICF code '${code}' not found. Use {"action": "search", "query": "..."} to find codes.`);
  }

  return text(formatEntity(entity));
}

async function handleSearch(
  query: string,
  maxResults: number,
  client: WHOICFClient
): Promise<ToolResult> {
  const results = await client.search(query, maxResults);

  if (results.length === 0) {
    return text(`No ICF codes found for '${query}'. Try different search terms.`);
  }

  const lines: string[] = [`**ICF Search Results for '${query}':**\n`];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(`${i + 1}. **${result.code}**: ${result.title}`);
  }

  lines.push('\nUse {"action": "lookup", "code": "..."} for full details.');

  return text(lines.join("\n"));
}

async function handleBrowse(
  category: string,
  client: WHOICFClient
): Promise<ToolResult> {
  try {
    const result = await client.browseCategory(category);

    const lines: string[] = [
      `**ICF Category: ${result.name}** (codes starting with '${result.category}')`,
      "",
      result.description,
      "",
    ];

    if (result.results.length > 0) {
      lines.push("**Codes in this category:**");
      for (const item of result.results.slice(0, 20)) {
        lines.push(`  - **${item.code}**: ${item.title}`);
      }
    } else {
      lines.push("*No child codes found — this may be a leaf-level code.*");
    }

    lines.push('\nUse {"action": "children", "code": "..."} to drill deeper, or {"action": "lookup"} for full details.');

    return text(lines.join("\n"));
  } catch (error) {
    return text(String(error instanceof Error ? error.message : error), true);
  }
}

async function handleChildren(code: string, client: WHOICFClient): Promise<ToolResult> {
  const children = await client.getChildren(code);

  if (children.length === 0) {
    return text(`No child codes found for '${code}'. This may be a leaf-level code.`);
  }

  const lines: string[] = [`**Child codes under ${code}:**\n`];

  for (const child of children) {
    lines.push(`- **${child.code}**: ${child.title}`);
  }

  return text(lines.join("\n"));
}

async function handleParent(code: string, client: WHOICFClient): Promise<ToolResult> {
  const [entity, parent] = await client.getParent(code);

  if (!entity) {
    return text(`ICF code '${code}' not found. Please check the code format.`);
  }

  if (!parent) {
    return text(
      `**${entity.code}**: ${entity.title}\n\n` +
      `This is a top-level code with no parent category.`
    );
  }

  const lines = [
    `**Parent of ${entity.code} (${entity.title}):**\n`,
    formatEntity(parent),
  ];

  if (parent.children && parent.children.length > 0) {
    lines.push(
      `\n*${parent.code} has ${parent.children.length} child code(s). ` +
      `Use {"action": "children", "code": "${parent.code}"} to see all.*`
    );
  }

  return text(lines.join("\n"));
}

async function handleSiblings(code: string, client: WHOICFClient): Promise<ToolResult> {
  const [entity, siblings] = await client.getSiblings(code);

  if (!entity) {
    return text(`ICF code '${code}' not found. Please check the code format.`);
  }

  if (siblings.length === 0) {
    return text(
      `**${entity.code}**: ${entity.title}\n\n` +
      `No sibling codes found (this may be the only child of its parent).`
    );
  }

  const lines = [`**Siblings of ${entity.code} (${entity.title}):**\n`];

  for (const sibling of siblings) {
    lines.push(`- **${sibling.code}**: ${sibling.title}`);
  }

  lines.push(`\n*${siblings.length} sibling(s) found.*`);

  return text(lines.join("\n"));
}

async function handleChain(code: string, client: WHOICFClient): Promise<ToolResult> {
  const chain = await client.getCodeChain(code);

  if (chain.length === 0) {
    return text(`ICF code '${code}' not found. Please check the code format.`);
  }

  if (chain.length === 1) {
    const entity = chain[0];
    return text(`**${entity.code}**: ${entity.title}\n\nThis is a top-level code.`);
  }

  const lines = [`**Hierarchy for ${code}:**\n`];

  for (let i = 0; i < chain.length; i++) {
    const entity = chain[i];
    const indent = "  ".repeat(i);
    if (i === chain.length - 1) {
      // Final (target) code — show full details
      lines.push(`${indent}→ **${entity.code}**: ${entity.title}`);
      if (entity.definition) {
        lines.push(`${indent}  _${entity.definition}_`);
      }
    } else {
      lines.push(`${indent}→ ${entity.code}: ${entity.title}`);
    }
  }

  lines.push(`\n*${chain.length} level(s) deep.*`);

  return text(lines.join("\n"));
}

async function handleProfile(codes: string[], client: WHOICFClient): Promise<ToolResult> {
  const components: Record<string, { name: string; items: ICFEntity[] }> = Object.fromEntries(
    Object.entries(COMPONENTS).map(([prefix, name]) => [prefix, { name, items: [] }])
  );

  const notFound: string[] = [];

  const cleaned = codes.map((code) => code.trim().toLowerCase());
  const entities = await Promise.all(cleaned.map((c) => client.getEntityByCode(c)));

  for (let i = 0; i < codes.length; i++) {
    const entity = entities[i];
    const prefix = cleaned[i][0];
    if (entity && prefix in components) {
      components[prefix].items.push(entity);
    } else {
      notFound.push(codes[i]);
    }
  }

  const lines = ["**ICF Functional Profile**\n"];

  for (const comp of Object.values(components)) {
    if (comp.items.length > 0) {
      lines.push(`\n### ${comp.name}\n`);
      for (const entity of comp.items) {
        lines.push(`- **${entity.code}**: ${entity.title}`);
        if (entity.definition) {
          lines.push(`  _${entity.definition}_`);
        }
      }
    }
  }

  if (notFound.length > 0) {
    lines.push(`\n**Codes not found:** ${notFound.join(", ")}`);
  }

  const total = Object.values(components).reduce((sum, c) => sum + c.items.length, 0);
  const active = Object.values(components).filter((c) => c.items.length > 0).length;
  lines.push(`\n---\n*Profile contains ${total} code(s) across ${active} component(s).*`);

  return text(lines.join("\n"));
}

function handleQualifier(component?: string, qualifier?: number): ToolResult {
  return text(explainQualifier(component || "generic", qualifier));
}

async function handleValidate(code: string, client: WHOICFClient): Promise<ToolResult> {
  const parsed = parseIcfCode(code);

  if (parsed.error && !parsed.baseCode) {
    return text(parsed.error);
  }

  const lines = [
    `**Code Analysis: ${code.trim()}**\n`,
    `- **Base code:** ${parsed.baseCode}`,
    `- **Component:** ${parsed.componentName} (${parsed.component})`,
    `- **Level:** ${parsed.level}`,
    `- **Chapter:** ${parsed.component}${parsed.digits![0]}`,
  ];

  // Show qualifier breakdown
  if (parsed.error) {
    lines.push(`\n**Qualifier error:** ${parsed.error}`);
  } else if (parsed.qualifiers.length > 0) {
    lines.push("\n**Qualifiers:**");
    for (const q of parsed.qualifiers) {
      lines.push(`- **${q.name}:** ${q.value} — ${q.meaning}`);
    }
  }

  // Verify base code against the WHO API
  try {
    const entity = await client.getEntityByCode(parsed.baseCode!);
    if (entity) {
      lines.push(`\n**Valid:** Base code confirmed in WHO ICD-API.`);
      lines.push(`- **Title:** ${entity.title}`);
      if (entity.definition) {
        lines.push(`- **Definition:** ${entity.definition}`);
      }
      if (entity.children && entity.children.length > 0) {
        lines.push(`- **Children:** ${entity.children.length} subcategory code(s)`);
      }
    } else {
      lines.push(
        `\n**Not found** in the WHO API. The format is valid but this ` +
        `code may not exist in the current release.`
      );
    }
  } catch {
    lines.push(`\n**Could not verify** against the WHO API.`);
  }

  return text(lines.join("\n"));
}

async function handleParse(code: string, client: WHOICFClient): Promise<ToolResult> {
  const parsed = parseIcfCode(code);

  if (parsed.error && !parsed.baseCode) {
    return text(parsed.error);
  }

  const lines = [`**Parsed: ${code.trim()}**\n`];

  // Look up the base code
  try {
    const entity = await client.getEntityByCode(parsed.baseCode!);
    if (entity) {
      lines.push(`**${parsed.baseCode}**: ${entity.title}`);
      if (entity.definition) {
        lines.push(`_${entity.definition}_\n`);
      } else {
        lines.push("");
      }
    } else {
      lines.push(`**${parsed.baseCode}**: *(not found in WHO API)*\n`);
    }
  } catch {
    lines.push(`**${parsed.baseCode}**: *(could not verify)*\n`);
  }

  lines.push(`**Component:** ${parsed.componentName}`);

  if (parsed.error) {
    lines.push(`\n**Qualifier error:** ${parsed.error}`);
  } else if (parsed.qualifiers.length > 0) {
    lines.push(`\n**Qualifiers:**\n`);
    for (const q of parsed.qualifiers) {
      lines.push(`- **${q.name}** (value ${q.value}): ${q.meaning}`);
    }
  } else {
    lines.push(
      '\n*No qualifiers specified. Use {"action": "qualifier", "component": ' +
      `"${parsed.component}"} to see available qualifiers.*`
    );
  }

  // Show the expected qualifier pattern for this component
  const patterns: Record<string, string> = {
    b: "b{code}.{extent}",
    s: "s{code}.{extent}{nature}{location}",
    d: "d{code}.{performance}{capacity}",
    e: "e{code}.{barrier}  or  e{code}+{facilitator}",
  };
  lines.push(`\n**Qualifier format for ${parsed.componentName}:** \`${patterns[parsed.component!]}\``);

  return text(lines.join("\n"));
}

// =============================================================================
// Assessment Instrument Handlers
// =============================================================================

function handleInstruments(domain?: string): ToolResult {
  let instruments = Object.values(inst.INSTRUMENTS);

  if (domain) {
    const domainLower = domain.trim().toLowerCase();
    instruments = instruments.filter((i) => i.domain.toLowerCase().includes(domainLower));
  }

  if (instruments.length === 0) {
    return text(
      `No instruments found for domain '${domain}'.\n\n` +
      `Available domains: ${inst.DOMAINS.join(", ")}`
    );
  }

  const lines = [domain ? `**Assessment Instruments — ${domain}**\n` : "**Available Assessment Instruments**\n"];

  const sorted = [...instruments].sort((a, b) =>
    a.domain === b.domain ? a.abbreviation.localeCompare(b.abbreviation) : a.domain.localeCompare(b.domain)
  );

  for (const i of sorted) {
    lines.push(
      `- **${i.abbreviation}** — ${i.name}\n` +
      `  ${i.domain} · ${i.items.length} items · ${i.completionTime} · ` +
      `Recall: ${i.recallPeriod} · RPM: ${i.rpmFrequency}`
    );
  }

  lines.push(
    `\n*${instruments.length} instrument(s). ` +
    'Use {"action": "instrument", "name": "..."} for full item text and scoring.*'
  );
  lines.push(`\n**Domains:** ${inst.DOMAINS.join(", ")}`);

  return text(lines.join("\n"));
}

function handleInstrumentDetails(name: string): ToolResult {
  const instrument = inst.resolveInstrument(name);
  if (!instrument) {
    const available = Object.values(inst.INSTRUMENTS).map((i) => i.abbreviation).join(", ");
    return text(`Unknown instrument '${name}'. Available: ${available}`);
  }

  const lines = [
    `**${instrument.abbreviation}: ${instrument.name}**\n`,
    instrument.description,
    "",
    `- **Domain:** ${instrument.domain}`,
    `- **Conditions:** ${instrument.conditions.join(", ")}`,
    `- **Items:** ${instrument.items.length}`,
    `- **Score range:** ${instrument.minScore}–${instrument.maxScore}`,
    `- **Scoring:** ${instrument.scoringMethod}`,
    `- **Recall period:** ${instrument.recallPeriod}`,
    `- **Administration:** ${instrument.administration}`,
    `- **Completion time:** ${instrument.completionTime}`,
    `- **RPM frequency:** ${instrument.rpmFrequency}`,
  ];

  if (instrument.notes) {
    lines.push(`- **Notes:** ${instrument.notes}`);
  }

  lines.push("\n### Items\n");
  for (const item of instrument.items) {
    const optionsStr = item.options.map((o) => `${o.value}=${o.label}`).join(" | ");
    lines.push(`**${item.number}.** ${item.text}`);
    lines.push(`   _Options: ${optionsStr}_\n`);
  }

  lines.push("### Score Interpretation\n");
  for (const sr of instrument.scoreRanges) {
    const qStr = sr.icfQualifier !== null ? ` (ICF qualifier: ${sr.icfQualifier})` : "";
    lines.push(`- **${sr.minScore}–${sr.maxScore}**: ${sr.severity} — ${sr.description}${qStr}`);
  }

  lines.push("\n### ICF Mappings\n");
  const primary = instrument.icfMappings.filter((m) => m.relationship === "primary");
  const secondary = instrument.icfMappings.filter((m) => m.relationship === "secondary");
  const related = instrument.icfMappings.filter((m) => m.relationship === "related");

  if (primary.length > 0) {
    lines.push("**Primary:**");
    for (const m of primary) lines.push(`- ${m.code}: ${m.name}`);
  }
  if (secondary.length > 0) {
    lines.push("**Secondary:**");
    for (const m of secondary) lines.push(`- ${m.code}: ${m.name}`);
  }
  if (related.length > 0) {
    lines.push("**Related:**");
    for (const m of related) lines.push(`- ${m.code}: ${m.name}`);
  }

  lines.push(`\n### References\n`);
  for (const ref of instrument.references) {
    lines.push(`- ${ref}`);
  }

  return text(lines.join("\n"));
}

function handleScore(name: string, responses: number[]): ToolResult {
  const result = inst.scoreInstrument(name, responses);

  if ("error" in result) {
    const instrument = inst.resolveInstrument(name);
    if (instrument) {
      return text(
        `**Scoring error:** ${result.error}\n\n` +
        `**${instrument.abbreviation}** expects ${instrument.items.length} responses.\n` +
        `Use {"action": "instrument", "name": "${name}"} to see all items.`
      );
    }
    return text(`**Error:** ${result.error}`);
  }

  const lines = [
    `**${result.instrument} Score: ${result.totalScore}** ` +
    `(range: ${result.minPossible}–${result.maxPossible})\n`,
    `- **Severity:** ${result.severity}`,
    `- **Interpretation:** ${result.description}`,
  ];

  if (result.icfQualifier !== null) {
    const q = result.icfQualifier;
    const qLabel = q in GENERIC_SCALE ? GENERIC_SCALE[q][0] : "Unknown";
    lines.push(`- **ICF Qualifier:** ${q} — ${qLabel}`);
  }

  // SLEDAI-specific: organ system summary
  if (result.organSystems) {
    const active = Object.entries(result.organSystems)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (active.length > 0) {
      lines.push(`- **Active organ systems:** ${active.join(", ")}`);
    }
    lines.push(`- **Active descriptors:** ${result.activeDescriptors}/24`);
  }

  // HAQ-specific: category breakdown
  if (result.categoryScores) {
    lines.push("\n**Category scores:**");
    for (const [cat, score] of Object.entries(result.categoryScores)) {
      lines.push(`- ${cat}: ${score}`);
    }
  }

  // Show mapped ICF codes
  const instrument = inst.resolveInstrument(name);
  if (instrument) {
    const primaryCodes = instrument.icfMappings.filter((m) => m.relationship === "primary");
    if (primaryCodes.length > 0) {
      lines.push("\n**Primary ICF codes for this assessment:**");
      for (const m of primaryCodes.slice(0, 6)) {
        lines.push(`- ${m.code}: ${m.name}`);
      }
    }
  }

  return text(lines.join("\n"));
}

function handleSuggest(condition?: string, icfCode?: string, domain?: string): ToolResult {
  if (!condition && !icfCode && !domain) {
    return text(
      "Please provide at least one of: condition, code, or domain.\n\n" +
      "Examples:\n" +
      '- {"action": "suggest", "condition": "rheumatoid arthritis"}\n' +
      '- {"action": "suggest", "code": "b280"} (pain)\n' +
      '- {"action": "suggest", "domain": "Mental Health"}'
    );
  }

  const matches: Array<[inst.Instrument, string]> = [];

  for (const instrument of Object.values(inst.INSTRUMENTS)) {
    const reasons: string[] = [];

    if (condition) {
      const condLower = condition.trim().toLowerCase();
      for (const c of instrument.conditions) {
        if (c.toLowerCase().includes(condLower) || condLower.includes(c.toLowerCase())) {
          reasons.push(`Condition match: ${c}`);
          break;
        }
      }
    }

    if (icfCode) {
      const codeLower = icfCode.trim().toLowerCase();
      for (const m of instrument.icfMappings) {
        if (m.code.toLowerCase() === codeLower || m.code.toLowerCase().startsWith(codeLower)) {
          reasons.push(`Maps to ${m.code} (${m.name}) [${m.relationship}]`);
          break;
        }
      }
    }

    if (domain) {
      const domainLower = domain.trim().toLowerCase();
      if (instrument.domain.toLowerCase().includes(domainLower)) {
        reasons.push(`Domain: ${instrument.domain}`);
      }
    }

    if (reasons.length > 0) {
      matches.push([instrument, reasons.join("; ")]);
    }
  }

  if (matches.length === 0) {
    const queryParts: string[] = [];
    if (condition) queryParts.push(`condition='${condition}'`);
    if (icfCode) queryParts.push(`ICF code='${icfCode}'`);
    if (domain) queryParts.push(`domain='${domain}'`);
    return text(
      `No instruments found matching ${queryParts.join(", ")}.\n\n` +
      `Available domains: ${inst.DOMAINS.join(", ")}\n` +
      'Use {"action": "instruments"} to see all available instruments.'
    );
  }

  const lines = ["**Suggested Instruments**\n"];
  const queryParts: string[] = [];
  if (condition) queryParts.push(`Condition: ${condition}`);
  if (icfCode) queryParts.push(`ICF code: ${icfCode}`);
  if (domain) queryParts.push(`Domain: ${domain}`);
  lines.push(`_Query: ${queryParts.join(" · ")}_\n`);

  const sorted = [...matches].sort((a, b) => a[0].abbreviation.localeCompare(b[0].abbreviation));
  for (const [instrument, reason] of sorted) {
    lines.push(
      `### ${instrument.abbreviation}: ${instrument.name}\n` +
      `- **Why:** ${reason}\n` +
      `- **Domain:** ${instrument.domain}\n` +
      `- **Items:** ${instrument.items.length} · **Time:** ${instrument.completionTime}\n` +
      `- **RPM frequency:** ${instrument.rpmFrequency}\n`
    );
  }

  lines.push(
    `*${matches.length} instrument(s) matched. ` +
    'Use {"action": "instrument", "name": "..."} for full questionnaire items.*'
  );

  return text(lines.join("\n"));
}

function handleMapping(name: string): ToolResult {
  const instrument = inst.resolveInstrument(name);
  if (!instrument) {
    const available = Object.values(inst.INSTRUMENTS).map((i) => i.abbreviation).join(", ");
    return text(`Unknown instrument '${name}'. Available: ${available}`);
  }

  const lines = [
    `**ICF Mapping: ${instrument.abbreviation} (${instrument.name})**\n`,
    `Domain: ${instrument.domain}\n`,
  ];

  const byComponent: Record<string, inst.ICFMapping[]> = { b: [], s: [], d: [], e: [] };
  for (const m of instrument.icfMappings) {
    const prefix = m.code[0].toLowerCase();
    if (prefix in byComponent) {
      byComponent[prefix].push(m);
    }
  }

  for (const [prefix, mappings] of Object.entries(byComponent)) {
    if (mappings.length > 0) {
      lines.push(`\n### ${COMPONENTS[prefix]}\n`);
      for (const m of mappings) {
        lines.push(`- **${m.code}**: ${m.name} [${m.relationship}]`);
      }
    }
  }

  // Summary stats
  const total = instrument.icfMappings.length;
  const primary = instrument.icfMappings.filter((m) => m.relationship === "primary").length;
  lines.push(
    `\n---\n*${total} ICF codes mapped (${primary} primary). ` +
    'Use {"action": "lookup", "code": "..."} on any code for full WHO API details.*'
  );

  return text(lines.join("\n"));
}

async function handleApi(path: string, client: WHOICFClient): Promise<ToolResult> {
  if (!path.startsWith("/")) {
    return text("Path must start with /", true);
  }

  try {
    const result = await client.rawRequest(path);
    return text(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return text(`API Error: ${message}`, true);
  }
}

function handleHelp(): ToolResult {
  return text(`# ICF MCP Server

## Code & Hierarchy Actions

**lookup** - Get full details for an ICF code
  {"action": "lookup", "code": "b280"}

**search** - Find codes by keyword
  {"action": "search", "query": "walking"}
  {"action": "search", "query": "pain", "max_results": 5}

**browse** - Explore a category or sub-chapter
  {"action": "browse", "category": "b"}   (Body Functions)
  {"action": "browse", "category": "d4"}  (Mobility chapter)

**children** - Get subcodes
  {"action": "children", "code": "d4"}

**parent** - Navigate up to a code's parent category
  {"action": "parent", "code": "d450"}

**siblings** - Codes at the same level (same parent)
  {"action": "siblings", "code": "d450"}

**chain** - Full hierarchy path from root to a code
  {"action": "chain", "code": "d4501"}

**profile** - Build a functional profile from multiple codes
  {"action": "profile", "codes": ["b280", "d450", "e120"]}

## Qualifier Actions

**qualifier** - Component-specific qualifier reference
  {"action": "qualifier"}                              (generic scale)
  {"action": "qualifier", "component": "s"}            (body structures, 3 qualifiers)
  {"action": "qualifier", "component": "b", "qualifier": 2}

**validate** - Validate format, qualifiers, and existence
  {"action": "validate", "code": "d450.23"}

**parse** - Parse a fully qualified code
  {"action": "parse", "code": "s730.312"}
  {"action": "parse", "code": "e120+3"}

## Assessment Instrument Actions

**instruments** - List clinical instruments (GAD-7, PHQ-9, SLEDAI-2K, WHODAS 2.0, ...)
  {"action": "instruments"}
  {"action": "instruments", "domain": "Mental Health"}

**instrument** - Full instrument spec: items, scoring, ICF mappings
  {"action": "instrument", "name": "GAD-7"}

**score** - Score responses and get clinical interpretation
  {"action": "score", "name": "GAD-7", "responses": [1, 2, 1, 0, 1, 2, 1]}

**suggest** - Suggest instruments for a condition, ICF code, or domain
  {"action": "suggest", "condition": "rheumatoid arthritis"}
  {"action": "suggest", "code": "b280"}

**mapping** - How an instrument maps to ICF codes
  {"action": "mapping", "name": "WHODAS"}

## Meta Actions

**overview** - ICF system overview
  {"action": "overview"}

**api** - Raw WHO API request
  {"action": "api", "path": "/icd/release/11/2025-01/icf"}

## ICF Code Prefixes
- **b**: Body Functions (physiological/psychological)
- **s**: Body Structures (anatomical)
- **d**: Activities & Participation (tasks/life involvement)
- **e**: Environmental Factors (physical/social/attitudinal)

## Qualifiers (severity)
0=none, 1=mild, 2=moderate, 3=severe, 4=complete, 8=not specified, 9=not applicable
Components differ: b=1 qualifier, s=3, d=2 (performance+capacity), e=barrier(.)/facilitator(+)

## More Info
https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health`);
}

function handleOverview(): ToolResult {
  return text(`**International Classification of Functioning, Disability and Health (ICF)**

The ICF is a WHO classification providing a standard language for describing health and health-related states. It complements ICD (diagnosis codes) by describing how conditions affect functioning.

## Structure

### Body Functions (b)
Physiological functions including psychological functions.
- b1: Mental functions
- b2: Sensory functions and pain
- b3: Voice and speech
- b4: Cardiovascular, respiratory systems
- b5: Digestive, metabolic, endocrine
- b6: Genitourinary and reproductive
- b7: Neuromusculoskeletal and movement
- b8: Skin and related structures

### Body Structures (s)
Anatomical parts of the body.
- s1-s8: Corresponding structures

### Activities and Participation (d)
Task execution and life involvement.
- d1: Learning and applying knowledge
- d2: General tasks and demands
- d3: Communication
- d4: Mobility
- d5: Self-care
- d6: Domestic life
- d7: Interpersonal interactions
- d8: Major life areas
- d9: Community, social, civic life

### Environmental Factors (e)
Physical, social, attitudinal environment.
- e1: Products and technology
- e2: Natural environment
- e3: Support and relationships
- e4: Attitudes
- e5: Services, systems, policies

## Qualifiers

Each component has its own qualifier system:

**Body Functions (b):** 1 qualifier — extent of impairment (0-4)
  Example: b280.2 = moderate pain impairment

**Body Structures (s):** 3 qualifiers — extent, nature of change, location
  Example: s730.312 = severe extent, total absence, left side

**Activities & Participation (d):** 2 qualifiers — performance, capacity
  Example: d450.23 = moderate performance difficulty, severe capacity limitation

**Environmental Factors (e):** barriers (.) or facilitators (+)
  Example: e120.2 = moderate barrier; e120+3 = substantial facilitator

Generic severity scale (0-4): 0=none, 1=mild, 2=moderate, 3=severe, 4=complete

## Clinical Assessment Instruments

11 standardized instruments with ICF mappings and scoring:
GAD-7, PHQ-9, RADAI-5, SLEDAI-2K, WHODAS 2.0, HAQ-DI, PROMIS-10, CAT, ODI, NRS Pain, Short FES-I

Use {"action": "instruments"} to list them or {"action": "help"} for all available actions.`);
}
