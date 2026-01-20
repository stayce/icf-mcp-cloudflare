/**
 * ICF MCP Server - Type Definitions
 */

import { z } from "zod";

// Server metadata
export const SERVER_NAME = "icf-mcp-server";
export const SERVER_VERSION = "1.0.0";

// Environment interface for Cloudflare Workers
export interface Env {
  WHO_CLIENT_ID: string;
  WHO_CLIENT_SECRET: string;
  WHO_API_RELEASE?: string;
  WHO_API_LANGUAGE?: string;
}

// MCP Tool result type
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// ICF action schema - single tool with action dispatch
export const ICFParams = z.object({
  action: z.enum(["lookup", "search", "browse", "children", "qualifier", "overview", "api", "help"]),
  code: z.string().optional().describe("ICF code (e.g., b280, d450, s750)"),
  query: z.string().optional().describe("Search terms"),
  category: z.string().optional().describe("Category letter: b, s, d, or e"),
  qualifier: z.number().optional().describe("Qualifier value (0-4, 8, or 9)"),
  max_results: z.number().optional().describe("Maximum results (default 10)"),
  path: z.string().optional().describe("API path for raw requests"),
});

export type ICFParamsType = z.infer<typeof ICFParams>;
