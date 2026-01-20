/**
 * ICF MCP Server - Cloudflare Workers Entry Point
 *
 * A Model Context Protocol (MCP) server that provides tools for accessing
 * the WHO ICF (International Classification of Functioning, Disability and Health)
 * classification system.
 *
 * Deployed on Cloudflare Workers for global edge availability.
 */

import { createMcpHandler } from "agents/mcp";
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
}

// Server metadata
const SERVER_NAME = "icf-mcp-server";
const SERVER_VERSION = "1.0.0";

/**
 * Create MCP server with tools configured for the given environment
 */
function createServer(env: Env) {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Create WHO client
  const client = new WHOICFClient({
    clientId: env.WHO_CLIENT_ID,
    clientSecret: env.WHO_CLIENT_SECRET,
    release: env.WHO_API_RELEASE || "2025-01",
    language: env.WHO_API_LANGUAGE || "en",
  });

  // Register tools with client bound
  server.tool(
    "icf_lookup",
    {
      code: z.string().describe('The ICF code to look up (e.g., "b280", "d450")'),
    },
    async ({ code }) => {
      return handleToolCall("icf_lookup", { code }, client);
    }
  );

  server.tool(
    "icf_search",
    {
      query: z.string().describe('Search terms (e.g., "walking difficulty", "memory problems")'),
      max_results: z.number().optional().describe("Maximum results to return (default 10)"),
    },
    async ({ query, max_results }) => {
      return handleToolCall("icf_search", { query, max_results: max_results || 10 }, client);
    }
  );

  server.tool(
    "icf_browse_category",
    {
      category: z.string().describe("Category code: b (Body Functions), s (Body Structures), d (Activities/Participation), e (Environmental Factors)"),
    },
    async ({ category }) => {
      return handleToolCall("icf_browse_category", { category }, client);
    }
  );

  server.tool(
    "icf_get_children",
    {
      code: z.string().describe("Parent ICF code to get children for"),
    },
    async ({ code }) => {
      return handleToolCall("icf_get_children", { code }, client);
    }
  );

  server.tool(
    "icf_explain_qualifier",
    {
      qualifier: z.number().describe("Qualifier value (0-4, 8, or 9)"),
    },
    async ({ qualifier }) => {
      return handleToolCall("icf_explain_qualifier", { qualifier }, client);
    }
  );

  server.tool(
    "icf_overview",
    {},
    async () => {
      return handleToolCall("icf_overview", {}, client);
    }
  );

  return server;
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
          endpoints: {
            mcp: "/mcp",
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

    // MCP endpoint - streamable HTTP transport
    if (url.pathname === "/mcp") {
      const server = createServer(env);
      const handler = createMcpHandler(server);
      return handler(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};
