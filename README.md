# openclaw-amiko-plugin

An [OpenClaw](https://openclaw.dev) channel plugin that connects your OpenClaw bot to the [Amiko](https://amiko.app) platform, enabling direct and group chat via webhook.

## Overview

This plugin registers an `amiko` channel with OpenClaw and provides:

- **Direct messages** — receive and reply to 1:1 DMs from Amiko users
- **Group chat** — participate in Amiko group conversations (mention-triggered)
- **Webhook delivery** — inbound messages arrive via HTTP webhook (no polling)
- **Multi-account support** — configure multiple Amiko accounts under a single plugin
- **Security policies** — per-account DM allowlists and group access controls
- **Media support** — send text and media messages outbound

## Repository Structure

```
index.ts                  Plugin entry point (exported default)
src/
  channel.ts              ChannelPlugin definition
  monitor.ts              Webhook inbound monitor with jittered backoff
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

### 5. Obtain your Amiko bot token

The `token` is a **Bearer token** issued by the Amiko platform for your bot. It is used to authenticate every API call this plugin makes to `https://platform.heyamiko.com/api`.

To get a token:
1. Log in to the Amiko platform and open your bot settings.
2. Generate or copy the API token for the bot you want to connect.
3. Keep the token secret — treat it like a password.

> **Error: `Amiko account "default" has no token configured`**
> This means the `token` field is missing or empty in your `channels.amiko` config.
> The channel health status will show `unconfigured` until a valid token is set.

### 6. Configure the channel

Add the following to your OpenClaw config (e.g. `~/.openclaw/channels.yaml`):

```yaml
amiko:
  token: YOUR_AMIKO_BOT_TOKEN        # required — Bearer token from Amiko platform
  dmPolicy: allowlist                # allowlist | open | disabled (default: allowlist)
  allowFrom:                         # sender IDs allowed to DM (when dmPolicy=allowlist)
    - user-id-1
    - user-id-2
  groupPolicy: disabled              # disabled | allowlist | open (default: disabled)
  groupAllowFrom: []                 # group sender IDs (when groupPolicy=allowlist)
  webhookPath: /amiko/webhook/default  # inbound webhook path (default shown)
  webhookSecret: YOUR_WEBHOOK_SECRET   # optional HMAC secret for webhook validation
  apiBaseUrl: https://platform.heyamiko.com/api  # optional, this is the default
```

For multiple Amiko accounts:

```yaml
amiko:
  defaultAccount: main
  accounts:
    main:
      token: TOKEN_FOR_MAIN
      dmPolicy: allowlist
      allowFrom:
        - user-id-1
    secondary:
      token: TOKEN_FOR_SECONDARY
      dmPolicy: open
```

Each account gets its own webhook endpoint at `/amiko/webhook/<accountId>`.

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

## Development

### Type check

```bash
pnpm run typecheck
```

### Run M0 contract tests

```bash
pnpm run test:m0
```

All 25 tests should pass with no external dependencies.

## Planning Docs

- Comprehensive plan: `AMIKO_CHANNEL_COMPREHENSIVE_PLAN.md`
- Execution checklist: `AMIKO_CHANNEL_EXECUTION_CHECKLIST.md`
- M0 machine-readable contracts: `contracts/`
- M0 reference implementation: `src/m0/`
