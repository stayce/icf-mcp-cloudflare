# ICF MCP Server (Cloudflare Workers)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the WHO International Classification of Functioning, Disability and Health (ICF), deployed on Cloudflare Workers for global edge availability.

**Live URL:** `https://mcp-icf.medseal.app/mcp`

## What is ICF?

The ICF is a WHO classification that complements ICD (diagnosis codes) by describing how health conditions affect a person's functioning in daily life:

- **Body Functions (b)** - Physiological and psychological functions
- **Body Structures (s)** - Anatomical parts of the body
- **Activities and Participation (d)** - Task execution and life involvement
- **Environmental Factors (e)** - Physical, social, and attitudinal environment

## Tool

A single `icf` tool with action dispatch (token-efficient). 19 actions:

### Codes & Hierarchy

| Action | Description |
|--------|-------------|
| `lookup` | Look up a specific ICF code (e.g., `b280`, `d450`) |
| `search` | Search by keyword (e.g., "walking difficulty", "pain") |
| `browse` | Browse a category (`b`, `s`, `d`, `e`) or sub-chapter (`b1`, `d4`, `e3`) |
| `children` | Get subcategories of a code |
| `parent` | Navigate up to a code's parent category |
| `siblings` | Codes at the same level (same parent) |
| `chain` | Full hierarchy path from root to a code |
| `profile` | Build a functional profile from multiple codes |

### Qualifiers

| Action | Description |
|--------|-------------|
| `qualifier` | Component-specific qualifier reference (`b`=1, `s`=3, `d`=2, `e`=barrier/facilitator) |
| `validate` | Validate code format + qualifiers, verify existence in the WHO API |
| `parse` | Parse fully qualified codes (`d450.23`, `s730.312`, `e120+3`) |

### Clinical Assessment Instruments

11 standardized RPM instruments with items, scoring, and ICF mappings:
GAD-7, PHQ-9, RADAI-5, SLEDAI-2K, WHODAS 2.0, HAQ-DI, PROMIS-10, CAT, ODI, NRS Pain, Short FES-I.

| Action | Description |
|--------|-------------|
| `instruments` | List instruments, optionally filtered by domain |
| `instrument` | Full spec: items, response options, scoring, ICF mappings |
| `score` | Score responses → severity, interpretation, ICF qualifier |
| `suggest` | Suggest instruments for a condition, ICF code, or domain |
| `mapping` | Show an instrument's ICF code mappings |

### Meta

| Action | Description |
|--------|-------------|
| `overview` | Full ICF classification overview |
| `api` | Raw WHO API request (escape valve) |
| `help` | Action reference with examples |

Example call:

```json
{"action": "score", "name": "GAD-7", "responses": [1, 2, 1, 0, 1, 2, 1]}
```

Instrument and qualifier actions are pure logic and work without WHO API credentials; code/hierarchy actions require them.

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

## Testing

```bash
npm test
```

Regression tests cover instrument scoring (all 11 instruments) and qualifier parsing — pure logic, no WHO API credentials needed.

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
