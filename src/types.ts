/**
 * ICF MCP Server - Type Definitions
 */

import { z } from "zod";

// Server metadata
export const SERVER_NAME = "icf-mcp-server";
export const SERVER_VERSION = "1.1.0";

// Environment interface for Cloudflare Workers
export interface Env {
  WHO_CLIENT_ID: string;
  WHO_CLIENT_SECRET: string;
  WHO_API_RELEASE?: string;
  WHO_API_LANGUAGE?: string;
  MCP_AUTH_SECRET?: string;
}

// MCP Tool result type
export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// All supported actions on the single `icf` tool
export const ICF_ACTIONS = [
  // WHO API lookups
  "lookup",
  "search",
  "browse",
  "children",
  "parent",
  "siblings",
  "chain",
  "profile",
  // Qualifier parsing & validation (pure logic + optional API verification)
  "qualifier",
  "validate",
  "parse",
  // Clinical assessment instruments (no API dependency)
  "instruments",
  "instrument",
  "score",
  "suggest",
  "mapping",
  // Meta
  "overview",
  "api",
  "help",
] as const;

// ICF action schema - single tool with action dispatch
export const ICFParams = z.object({
  action: z.enum(ICF_ACTIONS),
  code: z.string().optional().describe("ICF code, optionally qualified (e.g., b280, d450.23, s730.312, e120+3)"),
  codes: z.array(z.string()).optional().describe("List of ICF codes for profile building (e.g., [\"b280\", \"d450\"])"),
  query: z.string().optional().describe("Search terms"),
  category: z.string().optional().describe("Component letter (b, s, d, e) or sub-chapter code (b1, d4, e3, ...)"),
  component: z.string().optional().describe("Qualifier component: generic (default), b, s, d, or e"),
  qualifier: z.number().optional().describe("Qualifier value (0-4, 8, or 9)"),
  max_results: z.number().optional().describe("Maximum results (default 10)"),
  name: z.string().optional().describe("Instrument name or abbreviation (e.g., GAD-7, PHQ-9, SLEDAI, WHODAS)"),
  responses: z.array(z.number()).optional().describe("Instrument responses, one per item in order (for score)"),
  condition: z.string().optional().describe("Clinical condition for instrument suggestions (e.g., rheumatoid arthritis)"),
  domain: z.string().optional().describe("Clinical domain filter (e.g., Mental Health, Rheumatology, Pain)"),
  path: z.string().optional().describe("API path for raw requests"),
});

export type ICFParamsType = z.infer<typeof ICFParams>;
