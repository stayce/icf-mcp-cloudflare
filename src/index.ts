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
      const rate = await enforceRateLimit(request, env);
      if (rate.response) return rate.response;
      const server = createServer(env);
      const handler = createMcpHandler(server);
      const response = await handler(request, env, ctx);
      return applyRateLimitHeaders(response, rate.headers);
    }

    return new Response("Not Found", { status: 404 });
  },
};

type RateLimitTier = { limit: number; windowMs: number; key: string };
type RateLimitResult = { response: Response | null; headers: Record<string, string> };

function getTier(request: Request, env: Env): RateLimitTier {
  const authHeader = request.headers.get("X-MCP-Auth");
  if (env.MCP_AUTH_SECRET && authHeader === env.MCP_AUTH_SECRET) {
    return { limit: 1000, windowMs: 60_000, key: "auth" };
  }
  const client = request.headers.get("X-MCP-Client");
  if (client) {
    return { limit: 300, windowMs: 60_000, key: `client:${client}` };
  }
  return { limit: 30, windowMs: 60_000, key: "anon" };
}

async function enforceRateLimit(request: Request, env: Env): Promise<RateLimitResult> {
  const cache = typeof caches !== "undefined" ? caches.default : undefined;
  if (!cache) return { response: null, headers: {} };

  const tier = getTier(request, env);
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const now = Date.now();
  const window = Math.floor(now / tier.windowMs);
  const resetAt = (window + 1) * tier.windowMs;
  const cacheKey = new Request(`https://rate-limit.local/${tier.key}/${ip}/${window}`);

  const cached = await cache.match(cacheKey);
  const count = cached ? Number(await cached.text()) : 0;

  const remaining = Math.max(0, tier.limit - count);
  const headers = buildRateLimitHeaders(tier.limit, remaining, resetAt);

  if (count >= tier.limit) {
    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
    return {
      response: new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          ...headers,
        },
      }
    ),
      headers,
    };
  }

  const nextCount = count + 1;
  const cacheResponse = new Response(String(nextCount), {
    headers: {
      "Cache-Control": `public, max-age=${Math.ceil((resetAt - now) / 1000)}`,
    },
  });
  await cache.put(cacheKey, cacheResponse);

  return { response: null, headers };
}

function buildRateLimitHeaders(limit: number, remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.floor(resetAt / 1000)),
  };
}

function applyRateLimitHeaders(response: Response, headers: Record<string, string>): Response {
  if (!headers || Object.keys(headers).length === 0) return response;
  const nextHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) {
    nextHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}
