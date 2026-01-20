/**
 * ICF MCP Server - Cloudflare Workers Entry Point
 *
 * A Model Context Protocol (MCP) server for the WHO ICF classification.
 * Single tool with action dispatch for token efficiency.
 */

import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WHOICFClient } from "./who-client";
import { handleAction } from "./handlers";
import { Env, SERVER_NAME, SERVER_VERSION, ICFParams } from "./types";

/**
 * Create MCP server with single tool configured for the given environment
 */
function createServer(env: Env) {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const client = new WHOICFClient({
    clientId: env.WHO_CLIENT_ID,
    clientSecret: env.WHO_CLIENT_SECRET,
    release: env.WHO_API_RELEASE || "2025-01",
    language: env.WHO_API_LANGUAGE || "en",
  });

  // Single tool with action dispatch - much more token efficient
  server.tool("icf", ICFParams.shape, async (args) => {
    if (!env.WHO_CLIENT_ID || !env.WHO_CLIENT_SECRET) {
      return {
        content: [{ type: "text" as const, text: "Error: WHO API credentials not configured" }],
        isError: true,
      };
    }

    const params = ICFParams.parse(args);
    return handleAction(params, client);
  });

  return server;
}

/**
 * Health endpoint response
 */
function healthResponse(): Response {
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
      tool: {
        name: "icf",
        actions: ["lookup", "search", "browse", "children", "qualifier", "overview", "api", "help"],
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

/**
 * Main Cloudflare Worker fetch handler
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return healthResponse();
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
