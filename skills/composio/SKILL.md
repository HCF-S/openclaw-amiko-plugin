---
name: composio
description: Composio tools (Gmail, Google Calendar, Calendly, etc.) via Amiko platform MCP proxy on the Amiko web app
homepage: https://composio.dev
metadata: {"openclaw":{"emoji":"📧","mcp":{"url":"amiko-web-mcp"}}}
---

# Composio Skill

This skill exposes **Composio** tools to your agent via the Amiko platform's MCP endpoint. The platform uses your twin-scoped Clawd token to obtain short-lived Composio sessions—no Composio API key is stored on this instance.

## How it works

- The wrapper writes a `config/mcporter.json` file in the workspace that points the `composio` MCP server to the Amiko web app's endpoint `/api/agents/:id/mcp`.
- The endpoint is authenticated with a **Clawd twin token** sent in the `Authorization: Bearer ...` header, sourced from the workspace `.amiko.json`.
- **OpenClaw** (via mcporter) connects directly to this Amiko endpoint as an MCP server so the agent can use Composio tools.

## MCP server URL

Use this URL in your OpenClaw MCP / mcp-bridge configuration (the wrapper will also write it into `config/mcporter.json`):

- **URL:** `https://platform.heyamiko.com/api/agents/<twinId>/mcp` (or your Amiko web base URL)

## Available toolkits (examples)

Once connected, the agent can use tools from Composio toolkits such as:

- **Gmail** – Read, send, search email
- **Google Calendar** – List and create events
- **Slack** – Read and send messages
- **GitHub** – Repos, issues, PRs
- **Spotify** – Playback, playlists
- **Google Sheets** – Read and write spreadsheets
- **Calendly** – Scheduling and availability
- **Notion**, **Discord**, **Linear**, and others (depending on platform configuration)

Exact tools depend on which apps you've connected in the Amiko platform Composio integration.

## Check connected services

To see which services are connected for this twin, call **COMPOSIO_SEARCH_TOOLS** with a relevant query. The response includes `toolkit_connection_statuses` with `has_active_connection` per toolkit:

```bash
mcporter call composio.COMPOSIO_SEARCH_TOOLS queries='[{"use_case": "read emails", "known_fields": ""}]' session='{"generate_id": true}'
```

Or for calendar: `queries='[{"use_case": "list calendar events", "known_fields": ""}]'`

The response lists each toolkit (gmail, googlesheets, googledrive, etc.) and whether it has an active connection. **Always use this** when the user asks what services/tools are connected.

## Connect Gmail / Google Calendar / Calendly (user auth)

When the user wants to connect Gmail, Google Calendar, Calendly, or another app:

1. **Get a session** – Call COMPOSIO_SEARCH_TOOLS first with a query for that app. Extract `session_id` from the response (e.g. `"mill"`). You MUST pass this `session_id` in all subsequent meta tool calls.

2. **Initiate connection** – Call COMPOSIO_MANAGE_CONNECTIONS with the toolkit name(s) as a **JSON array**. Use single-quoted JSON for array parameters:

   ```bash
   mcporter call composio.COMPOSIO_MANAGE_CONNECTIONS toolkits='["gmail"]' session_id='mill'
   ```

   For multiple apps: `toolkits='["gmail","googledrive","calendly"]'`

   **Important:** `toolkits` must be a JSON array string. Wrong: `toolkits="gmail"` or `toolkits=[gmail]`. Correct: `toolkits='["gmail"]'`.

3. **Share the link** – The response includes `redirect_url` per toolkit. Show it to the user as a **clickable markdown link** and tell them to open it, complete OAuth, then reply when done.

4. **Verify** – Do NOT execute any toolkit tools until the user confirms. Re-run COMPOSIO_SEARCH_TOOLS to verify `has_active_connection: true` for that toolkit.

Toolkit names: `gmail`, `googledrive`, `googlesheets`, `googlecalendar`, `calendly`, `slack`, `github`, etc. Use the exact identifiers returned by COMPOSIO_SEARCH_TOOLS.

## Troubleshooting

- On 401/403 from Composio, the proxy clears its session cache; the next request will fetch a new session automatically.
- Read `skills/composio/SKILL.md` (this file) from the workspace for agent-facing documentation.

## Using mcporter inside this container

This container includes the **mcporter** CLI preinstalled globally. When the Composio skill is deployed, a mcporter config file is created at **workspace `config/mcporter.json`** with the Composio MCP proxy registered as the named server **`composio`**. Run mcporter from the workspace directory (or with `--root` pointing at the workspace) so it picks up that config.

### Use the named `composio` MCP server

- **List all configured servers (including composio):**  
  `mcporter list`
- **List Composio tools:**  
  `mcporter list composio`
- **Call a Composio tool:**  
  `mcporter call composio.tool_name arg:value`

Example:

```bash
cd /data/.openclaw/workspace   # main workspace (or workspace-{agentId} for other agent)
mcporter list composio
mcporter call composio.COMPOSIO_SEARCH_TOOLS queries='[{"use_case": "read emails"}]' session='{"generate_id": true}'
```

**Meta tool calls:** COMPOSIO_SEARCH_TOOLS, COMPOSIO_MANAGE_CONNECTIONS, COMPOSIO_MULTI_EXECUTE_TOOL, etc. require `session_id` from a prior SEARCH_TOOLS response. For array parameters (e.g. `toolkits`), pass quoted JSON: `toolkits='["gmail"]'`.

Config location: `config/mcporter.json` in the workspace (created/updated when this skill is deployed). For more mcporter options (ad‑hoc URLs, OAuth, TypeScript clients), see the upstream MCPorter documentation.

