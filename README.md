# ICF MCP Server (Cloudflare Workers)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the WHO International Classification of Functioning, Disability and Health (ICF), deployed on Cloudflare Workers for global edge availability.

**Live URL:** `https://mcp-icf.medseal.app/mcp`

## What is ICF?

The ICF is a WHO classification that complements ICD (diagnosis codes) by describing how health conditions affect a person's functioning in daily life:

- **Body Functions (b)** - Physiological and psychological functions
- **Body Structures (s)** - Anatomical parts of the body
- **Activities and Participation (d)** - Task execution and life involvement
- **Environmental Factors (e)** - Physical, social, and attitudinal environment

## Tools

| Tool | Description |
|------|-------------|
| `icf_lookup` | Look up a specific ICF code (e.g., `b280`, `d450`) |
| `icf_search` | Search by keyword (e.g., "walking difficulty", "pain") |
| `icf_browse_category` | Browse top-level categories: `b`, `s`, `d`, `e` |
| `icf_get_children` | Get subcategories of a code |
| `icf_explain_qualifier` | Explain severity ratings (0-4, 8, 9) |
| `icf_overview` | Full ICF classification overview |

## Prerequisites

1. **WHO ICD-API credentials** (free): Register at https://icd.who.int/icdapi
2. **Cloudflare account** with Workers enabled
3. **Node.js 18+** and npm

## Installation

```bash
git clone https://github.com/stayce/icf-mcp-cloudflare.git
cd icf-mcp-cloudflare
npm install
```

## Configuration

1. Copy the example environment file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` with your WHO API credentials for local development.

3. For production, set secrets:
   ```bash
   wrangler secret put WHO_CLIENT_ID
   wrangler secret put WHO_CLIENT_SECRET
   ```

## Development

```bash
npm run dev
```

The server will be available at `http://localhost:8787`.

## Deployment

```bash
npm run deploy
```

For custom domain (configured in `wrangler.toml`):
```bash
wrangler deploy --env production
```

## Usage with Claude

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "icf": {
      "type": "url",
      "url": "https://mcp-icf.medseal.app/mcp"
    }
  }
}
```

Or if deploying your own:

```json
{
  "mcpServers": {
    "icf": {
      "type": "url",
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```

## Endpoints

- `/` or `/health` - Health check / server info
- `/mcp` - MCP protocol endpoint (streamable HTTP)

## API Reference

This server uses the [WHO ICD-API](https://icd.who.int/icdapi) which provides programmatic access to both ICD-11 and ICF classifications.

- API Documentation: https://icd.who.int/docs/icd-api/APIDoc-Version2/
- ICF Browser: https://icd.who.int/dev11/l-icf/en

## License

MIT License - see [LICENSE](LICENSE)

## Related

- [icf-mcp-server](https://github.com/stayce/icf-mcp-server) - Python version for Claude Desktop
