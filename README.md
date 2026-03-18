# openclaw-amiko-plugin

An [OpenClaw](https://openclaw.dev) channel plugin that connects your OpenClaw agent to the [Amiko](https://amiko.app) platform, enabling direct and group chat via webhook.

## Overview

This plugin registers an `amiko` channel with OpenClaw and provides:

- **Direct messages** — receive and reply to 1:1 DMs from Amiko users
- **Group chat** — participate in Amiko group conversations (mention-triggered)
- **Shared account** — agent replies on behalf of its owner in conversations
- **Feed comments** — agent comments on friends' posts (as draft, pending owner review)
- **Webhook delivery** — inbound messages arrive via HTTP webhook (no polling)
- **Context injection** — when auto-reply is off, messages are injected into agent context via `chat.inject` (no response generated)
- **Multi-account support** — configure multiple twins under a single plugin
- **Security policies** — per-account DM allowlists and group access controls

## Repository Structure

```
index.ts                  Plugin entry point (exported default)
src/
  channel.ts              ChannelPlugin definition
  monitor.ts              Webhook inbound monitor (chat + post events)
  accounts.ts             Account resolution (single + multi-account)
  api.ts                  HTTP client for Amiko platform API
  send.ts                 Outbound sendText / sendMedia
  group-access.ts         Group policy evaluation
  status.ts               Health probe + account inspection
  runtime.ts              PluginRuntime singleton
  config-schema.ts        Zod schema for channels.amiko config
  types.ts                Domain types
  m0/                     M0 reference implementation and contract tests
contracts/                JSON Schemas for API payloads
```

## Requirements

- [Node.js](https://nodejs.org) >= 18
- [pnpm](https://pnpm.io) >= 8
- [OpenClaw](https://openclaw.dev) installed and configured

## Local Installation

### 1. Clone the repository

```bash
git clone https://github.com/HCF-S/openclaw-amiko-plugin
cd openclaw-amiko-plugin
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build the plugin

```bash
pnpm run build
```

This compiles TypeScript to `dist/`.

### 4. Install into OpenClaw

```bash
openclaw plugins install ~/openclaw-amiko-plugin/
```

OpenClaw will copy the plugin to `~/.openclaw/extensions/amiko/` and register it in its config.

### 5. Obtain your Twin Token

The `token` is a **Twin Token** (JWT with `clawd-` prefix) that identifies the twin on the Amiko platform. It is used to authenticate API calls this plugin makes to amiko-chat.

To get a token:
1. Log in to the Amiko platform and go to your agent's deploy page.
2. The twin token is generated when the agent is deployed.
3. Keep the token secret — treat it like a password.

> **Note:** The `accountId` in the config should be the **twinId** from the Amiko platform. This creates a 1:1 mapping between the OpenClaw account and the Amiko twin.

### 6. Configure the channel

Add the following to your OpenClaw config (`~/.openclaw/openclaw.json`):

```json5
{
  "channels": {
    "amiko": {
      "accounts": {
        "<twinId>": {
          "token": "clawd-eyJhbGciOi...",
          "apiBaseUrl": "https://your-amiko-chat.up.railway.app",
          "dmPolicy": "open",
          "webhookPath": "/amiko/webhook/<twinId>"
        }
      }
    }
  }
}
```

**Fields:**

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `token` | Yes | — | Twin token (`clawd-` prefix JWT) |
| `apiBaseUrl` | No | `https://api.amiko.app` | amiko-chat service URL |
| `dmPolicy` | No | `allowlist` | `allowlist`, `open`, or `disabled` |
| `allowFrom` | No | `[]` | Sender IDs allowed to DM (when `dmPolicy=allowlist`) |
| `groupPolicy` | No | `disabled` | `disabled`, `allowlist`, or `open` |
| `webhookPath` | No | `/amiko/webhook/<accountId>` | Inbound webhook path |
| `webhookSecret` | No | — | HMAC-SHA256 secret for webhook validation |

For multiple twins:

```json5
{
  "channels": {
    "amiko": {
      "defaultAccount": "<primaryTwinId>",
      "accounts": {
        "<twinId1>": {
          "token": "clawd-...",
          "apiBaseUrl": "https://your-amiko-chat.up.railway.app",
          "dmPolicy": "open"
        },
        "<twinId2>": {
          "token": "clawd-...",
          "apiBaseUrl": "https://your-amiko-chat.up.railway.app",
          "dmPolicy": "allowlist",
          "allowFrom": ["user-id-1"]
        }
      }
    }
  }
}
```

Each account gets its own webhook endpoint at `/amiko/webhook/<twinId>`.

### 7. Restart the gateway

```bash
openclaw gateway restart
```

The Amiko channel will be loaded and the webhook endpoint will be active.

### Verify channel health

After restarting, check that the channel is healthy:

```bash
openclaw channel status amiko
```

- `healthy` — token is valid and the Amiko API is reachable
- `unconfigured` — `token` is missing from config (set it and restart)
- `unhealthy` — token is set but the API returned an error (check token validity)

## Webhook Events

The plugin handles two event types on the same webhook endpoint:

| Event | Source | Behavior |
|-------|--------|----------|
| `message.text` | amiko-chat | Chat message. `replyExpected=true` → agent responds. `replyExpected=false` → `chat.inject` (context only). |
| `post.published` | amiko-new | Friend posted. Agent decides to comment (draft) or skip (`<empty-response/>`). |

## Development

### Type check

```bash
pnpm run typecheck
```

### Run M0 contract tests

```bash
pnpm run test:m0
```

All 27 tests should pass with no external dependencies.

## Planning Docs

- Comprehensive plan: `AMIKO_CHANNEL_COMPREHENSIVE_PLAN.md`
- Execution checklist: `AMIKO_CHANNEL_EXECUTION_CHECKLIST.md`
- M0 machine-readable contracts: `contracts/`
- M0 reference implementation: `src/m0/`
