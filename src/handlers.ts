/**
 * ICF MCP Server - Action Handlers
 */

import { WHOICFClient, ICFEntity } from "./who-client";
import { ToolResult, ICFParamsType } from "./types";

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

      case "qualifier":
        if (params.qualifier === undefined) throw new Error("qualifier value required");
        return handleQualifier(params.qualifier);

      case "overview":
        return handleOverview();

      case "api":
        if (!params.path) throw new Error("path required for api");
        return await handleApi(params.path, client);

      case "help":
        return handleHelp();

      default:
        return {
          content: [{ type: "text", text: `Unknown action: ${params.action}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}

async function handleLookup(code: string, client: WHOICFClient): Promise<ToolResult> {
  const entity = await client.getEntityByCode(code);

  if (!entity) {
    return {
      content: [
        { type: "text", text: `ICF code '${code}' not found. Use {"action": "search", "query": "..."} to find codes.` },
      ],
    };
  }

  return {
    content: [{ type: "text", text: formatEntity(entity) }],
  };
}

async function handleSearch(
  query: string,
  maxResults: number,
  client: WHOICFClient
): Promise<ToolResult> {
  const results = await client.search(query, maxResults);

  if (results.length === 0) {
    return {
      content: [
        { type: "text", text: `No ICF codes found for '${query}'. Try different search terms.` },
      ],
    };
  }

  const lines: string[] = [`**ICF Search Results for '${query}':**\n`];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(`${i + 1}. **${result.code}**: ${result.title}`);
  }

  lines.push('\nUse {"action": "lookup", "code": "..."} for full details.');

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
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
      "**Sample codes in this category:**",
    ];

    for (const item of result.results.slice(0, 10)) {
      lines.push(`  - **${item.code}**: ${item.title}`);
    }

    lines.push('\nUse {"action": "search"} or {"action": "lookup"} for more.');

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: String(error) }],
      isError: true,
    };
  }
}

async function handleChildren(code: string, client: WHOICFClient): Promise<ToolResult> {
  const children = await client.getChildren(code);

  if (children.length === 0) {
    return {
      content: [
        { type: "text", text: `No child codes found for '${code}'. This may be a leaf-level code.` },
      ],
    };
  }

  const lines: string[] = [`**Child codes under ${code}:**\n`];

  for (const child of children) {
    lines.push(`- **${child.code}**: ${child.title}`);
  }

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

function handleQualifier(qualifier: number): ToolResult {
  const qualifiers: Record<number, [string, string, string]> = {
    0: ["No problem", "0-4%", "None, absent, negligible"],
    1: ["Mild problem", "5-24%", "Slight, low"],
    2: ["Moderate problem", "25-49%", "Medium, fair"],
    3: ["Severe problem", "50-95%", "High, extreme"],
    4: ["Complete problem", "96-100%", "Total"],
    8: ["Not specified", "N/A", "Insufficient information to specify severity"],
    9: ["Not applicable", "N/A", "Inappropriate to apply this code"],
  };

  if (!(qualifier in qualifiers)) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid qualifier '${qualifier}'. Valid: 0 (none), 1 (mild), 2 (moderate), 3 (severe), 4 (complete), 8 (not specified), 9 (not applicable)`,
        },
      ],
    };
  }

  const [level, percentage, description] = qualifiers[qualifier];

  return {
    content: [
      {
        type: "text",
        text: `**ICF Qualifier ${qualifier}: ${level}**

- **Percentage range:** ${percentage}
- **Description:** ${description}

Example: d450.${qualifier} means '${level.toLowerCase()}' difficulty with walking.`,
      },
    ],
  };
}

async function handleApi(path: string, client: WHOICFClient): Promise<ToolResult> {
  if (!path.startsWith("/")) {
    return {
      content: [{ type: "text", text: "Path must start with /" }],
      isError: true,
    };
  }

  try {
    const result = await client.rawRequest(path);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `API Error: ${message}` }],
      isError: true,
    };
  }
}

function handleHelp(): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `# ICF MCP Server

## Actions

**lookup** - Get full details for an ICF code
  {"action": "lookup", "code": "b280"}
  {"action": "lookup", "code": "d450"}

**search** - Find codes by keyword
  {"action": "search", "query": "walking"}
  {"action": "search", "query": "pain", "max_results": 5}

**browse** - Explore a category
  {"action": "browse", "category": "b"}  (Body Functions)
  {"action": "browse", "category": "d"}  (Activities)

**children** - Get subcodes
  {"action": "children", "code": "d4"}

**qualifier** - Explain severity ratings
  {"action": "qualifier", "qualifier": 2}

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
0=none, 1=mild, 2=moderate, 3=severe, 4=complete

## More Info
https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health`,
      },
    ],
  };
}

function handleOverview(): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: `**International Classification of Functioning, Disability and Health (ICF)**

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
- 0: No problem (0-4%)
- 1: Mild (5-24%)
- 2: Moderate (25-49%)
- 3: Severe (50-95%)
- 4: Complete (96-100%)

Use {"action": "help"} for available actions.`,
      },
    ],
  };
}
