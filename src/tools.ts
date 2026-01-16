/**
 * ICF MCP Tools - Tool definitions and handlers for the ICF MCP Server
 */

import { WHOICFClient, ICFEntity } from "./who-client";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

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
 * Tool definitions for the MCP server
 */
export const toolDefinitions = [
  {
    name: "icf_lookup",
    description: `Look up an ICF code and get its full details.

The ICF (International Classification of Functioning, Disability and Health)
codes describe how health conditions affect functioning. Code prefixes:
- b: Body Functions (e.g., b280 = sensation of pain)
- s: Body Structures (e.g., s750 = structure of lower extremity)
- d: Activities and Participation (e.g., d450 = walking)
- e: Environmental Factors (e.g., e120 = assistive products for mobility)`,
    inputSchema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: 'The ICF code to look up (e.g., "b280", "d450")',
        },
      },
      required: ["code"],
    },
  },
  {
    name: "icf_search",
    description: `Search the ICF classification by keywords or description.

Use this to find ICF codes when you know what functional area you're
looking for but don't know the specific code. For example:
- "walking" to find mobility-related codes
- "pain" to find pain-related body function codes
- "memory" to find cognitive function codes`,
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: 'Search terms (e.g., "walking difficulty", "memory problems")',
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "icf_browse_category",
    description: `Browse a top-level ICF category to explore available codes.

ICF has four main categories:
- "b": Body Functions - physiological and psychological functions
- "s": Body Structures - anatomical parts of the body
- "d": Activities and Participation - task execution and life involvement
- "e": Environmental Factors - physical, social, attitudinal environment`,
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description: "Single letter category code (b, s, d, or e)",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "icf_get_children",
    description: `Get the child codes (subcategories) of an ICF code.

ICF codes are hierarchical. For example:
- d4 (Mobility) contains d410-d499
- d45 (Walking and moving) contains d450-d459
- d450 (Walking) is a specific activity

Use this to drill down into more specific codes.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description: "Parent ICF code to get children for",
        },
      },
      required: ["code"],
    },
  },
  {
    name: "icf_explain_qualifier",
    description: `Explain ICF qualifier values used to rate severity of impairment.

ICF uses qualifiers (0-4, 8, 9) to indicate the magnitude of a problem.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        qualifier: {
          type: "number",
          description: "The qualifier value (0-4, 8, or 9)",
        },
      },
      required: ["qualifier"],
    },
  },
  {
    name: "icf_overview",
    description: `Get an overview of the ICF classification system.

Returns general information about ICF, its structure, and how to use it.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

/**
 * Handle tool calls
 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: WHOICFClient
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "icf_lookup":
        return await handleICFLookup(args.code as string, client);
      case "icf_search":
        return await handleICFSearch(
          args.query as string,
          (args.max_results as number) || 10,
          client
        );
      case "icf_browse_category":
        return await handleICFBrowseCategory(args.category as string, client);
      case "icf_get_children":
        return await handleICFGetChildren(args.code as string, client);
      case "icf_explain_qualifier":
        return handleICFExplainQualifier(args.qualifier as number);
      case "icf_overview":
        return handleICFOverview();
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
}

async function handleICFLookup(code: string, client: WHOICFClient): Promise<ToolResult> {
  const entity = await client.getEntityByCode(code);

  if (!entity) {
    return {
      content: [
        { type: "text", text: `ICF code '${code}' not found. Please check the code format.` },
      ],
    };
  }

  return {
    content: [{ type: "text", text: formatEntity(entity) }],
  };
}

async function handleICFSearch(
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

  lines.push("\nUse `icf_lookup` with any code above for full details.");

  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
}

async function handleICFBrowseCategory(
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

    lines.push("\nUse `icf_search` or `icf_lookup` for more specific codes.");

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

async function handleICFGetChildren(code: string, client: WHOICFClient): Promise<ToolResult> {
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

function handleICFExplainQualifier(qualifier: number): ToolResult {
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
          text: `Invalid qualifier '${qualifier}'. Valid values are: 0 (no problem), 1 (mild), 2 (moderate), 3 (severe), 4 (complete), 8 (not specified), 9 (not applicable)`,
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

function handleICFOverview(): ToolResult {
  const overview = `**International Classification of Functioning, Disability and Health (ICF)**

The ICF is a WHO classification that provides a standard language and framework 
for describing health and health-related states. It complements ICD (diagnosis 
codes) by describing how conditions affect a person's functioning.

## Structure

ICF has four main components:

### 1. Body Functions (b)
Physiological functions of body systems, including psychological functions.
- b1: Mental functions (consciousness, orientation, sleep, emotion)
- b2: Sensory functions and pain
- b3: Voice and speech functions
- b4: Functions of cardiovascular, respiratory systems
- b5: Functions of digestive, metabolic, endocrine systems
- b6: Genitourinary and reproductive functions
- b7: Neuromusculoskeletal and movement functions
- b8: Functions of skin and related structures

### 2. Body Structures (s)
Anatomical parts of the body.
- s1: Structures of nervous system
- s2: Eye, ear and related structures
- s3: Structures of voice and speech
- s4: Structures of cardiovascular, respiratory systems
- s5: Structures of digestive, metabolic, endocrine systems
- s6: Structures of genitourinary and reproductive systems
- s7: Structures of movement
- s8: Skin and related structures

### 3. Activities and Participation (d)
Execution of tasks and involvement in life situations.
- d1: Learning and applying knowledge
- d2: General tasks and demands
- d3: Communication
- d4: Mobility
- d5: Self-care
- d6: Domestic life
- d7: Interpersonal interactions
- d8: Major life areas (education, work, economic)
- d9: Community, social and civic life

### 4. Environmental Factors (e)
Physical, social and attitudinal environment.
- e1: Products and technology
- e2: Natural environment
- e3: Support and relationships
- e4: Attitudes
- e5: Services, systems and policies

## Qualifiers

Severity is rated on a scale:
- 0: No problem (0-4%)
- 1: Mild problem (5-24%)
- 2: Moderate problem (25-49%)
- 3: Severe problem (50-95%)
- 4: Complete problem (96-100%)

## Tools Available

- \`icf_lookup\`: Get details for a specific code
- \`icf_search\`: Find codes by keyword
- \`icf_browse_category\`: Explore a category
- \`icf_get_children\`: Get subcodes
- \`icf_explain_qualifier\`: Understand severity ratings

## More Information

ICF official site: https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health`;

  return {
    content: [{ type: "text", text: overview }],
  };
}
