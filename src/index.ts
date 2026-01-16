/**
 * ICF MCP Server - Cloudflare Workers Entry Point
 * 
 * A Model Context Protocol (MCP) server that provides tools for accessing
 * the WHO ICF (International Classification of Functioning, Disability and Health)
 * classification system.
 * 
 * Deployed on Cloudflare Workers for global edge availability.
 * 
 * By 4boots.us - Complementing Anthropic's ICD-10 connector with functional health classifications.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WHOICFClient } from "./who-client";
import { handleToolCall } from "./tools";

// Environment interface for Cloudflare Workers
export interface Env {
  WHO_CLIENT_ID: string;
  WHO_CLIENT_SECRET: string;
  WHO_API_RELEASE?: string;
  WHO_API_LANGUAGE?: string;
  MCP_OBJECT: DurableObjectNamespace;
}

// Server metadata
const SERVER_NAME = "icf-mcp-server";
const SERVER_VERSION = "1.0.0";

/**
 * ICF MCP Server - Durable Object class for Cloudflare Workers
 */
export class MyMCP extends McpAgent<Env> {
  server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  #client: WHOICFClient | null = null;

  /**
   * Get or create the WHO ICF client
   */
  private getClient(): WHOICFClient | null {
    if (!this.#client && this.env.WHO_CLIENT_ID && this.env.WHO_CLIENT_SECRET) {
      this.#client = new WHOICFClient({
        clientId: this.env.WHO_CLIENT_ID,
        clientSecret: this.env.WHO_CLIENT_SECRET,
        release: this.env.WHO_API_RELEASE || "2025-01",
        language: this.env.WHO_API_LANGUAGE || "en",
      });
    }
    return this.#client;
  }

  /**
   * Initialize MCP tools
   */
  async init() {
    // Tool: Look up an ICF code
    this.server.tool(
      "icf_lookup",
      {
        code: z.string().describe('The ICF code to look up (e.g., "b280", "d450")'),
      },
      async ({ code }) => {
        const client = this.getClient();
        if (!client) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: WHO ICD-API credentials not configured. Register at https://icd.who.int/icdapi",
            }],
            isError: true,
          };
        }
        return handleToolCall("icf_lookup", { code }, client);
      }
    );

    // Tool: Search ICF by keywords
    this.server.tool(
      "icf_search",
      {
        query: z.string().describe('Search terms (e.g., "walking difficulty", "memory problems")'),
        max_results: z.number().optional().describe("Maximum results to return (default 10)"),
      },
      async ({ query, max_results }) => {
        const client = this.getClient();
        if (!client) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: WHO ICD-API credentials not configured. Register at https://icd.who.int/icdapi",
            }],
            isError: true,
          };
        }
        return handleToolCall("icf_search", { query, max_results: max_results || 10 }, client);
      }
    );

    // Tool: Browse ICF category
    this.server.tool(
      "icf_browse_category",
      {
        category: z.string().describe("Category code: b (Body Functions), s (Body Structures), d (Activities/Participation), e (Environmental Factors)"),
      },
      async ({ category }) => {
        const client = this.getClient();
        if (!client) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: WHO ICD-API credentials not configured. Register at https://icd.who.int/icdapi",
            }],
            isError: true,
          };
        }
        return handleToolCall("icf_browse_category", { category }, client);
      }
    );

    // Tool: Get child codes
    this.server.tool(
      "icf_get_children",
      {
        code: z.string().describe("Parent ICF code to get children for"),
      },
      async ({ code }) => {
        const client = this.getClient();
        if (!client) {
          return {
            content: [{
              type: "text" as const,
              text: "Error: WHO ICD-API credentials not configured. Register at https://icd.who.int/icdapi",
            }],
            isError: true,
          };
        }
        return handleToolCall("icf_get_children", { code }, client);
      }
    );

    // Tool: Explain qualifier
    this.server.tool(
      "icf_explain_qualifier",
      {
        qualifier: z.number().describe("Qualifier value (0-4, 8, or 9)"),
      },
      async ({ qualifier }) => {
        return handleToolCall("icf_explain_qualifier", { qualifier }, null as any);
      }
    );

    // Tool: ICF overview
    this.server.tool(
      "icf_overview",
      {},
      async () => {
        return handleToolCall("icf_overview", {}, null as any);
      }
    );
  }
}

/**
 * Main Cloudflare Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          server: SERVER_NAME,
          version: SERVER_VERSION,
          description: "WHO ICF (International Classification of Functioning) MCP Server",
          provider: "4boots.us",
          endpoints: {
            mcp: "/mcp",
            sse: "/sse",
            health: "/health",
          },
          documentation: "https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // MCP endpoints are handled by the McpAgent via Durable Objects
    // Routes /mcp and /sse are handled automatically by the agents library
    
    return new Response("Not Found", { status: 404 });
  },
};
