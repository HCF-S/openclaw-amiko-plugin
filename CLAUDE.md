# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An OpenClaw channel plugin (`@heyamiko/openclaw-amiko`) that connects OpenClaw agents to the Amiko social platform via webhook. It handles DMs, group chat, feed post comments, and post-comment replies. The plugin registers as the `amiko` channel within OpenClaw's plugin system.

## Commands

```bash
pnpm install          # install dependencies
pnpm run build        # clean + compile (tsc -p tsconfig.build.json → dist/)
pnpm run typecheck    # type-check without emitting (tsc --noEmit)
pnpm run test         # node --test src/**/*.test.ts
pnpm run clean        # rm -rf dist .tmp
```

Tests use Node's built-in test runner (no Jest/Vitest). Run a single test file with:
```bash
node --test src/foo.test.ts
```

## Architecture

The plugin follows the OpenClaw channel plugin contract. Key flow:

1. **`index.ts`** — Default export with `register()`. Registers the channel plugin and HTTP webhook routes with OpenClaw's gateway. Routes are per-account (`/amiko/webhook/<twinId>`).

2. **`src/channel.ts`** (`amikoPlugin`) — The channel plugin object implementing OpenClaw's channel interface: config resolution, outbound send, status probes, security policy, and `gateway.startAccount` which boots the webhook monitor.

3. **`src/monitor.ts`** — Core inbound logic. `monitorAmikoProvider()` returns a webhook handler that parses/validates payloads and dispatches to event-specific processors:
   - `processChatEvent` — DM/group messages. If `replyExpected=true`, dispatches through OpenClaw's reply pipeline. If false, records context only (no agent response).
   - `processPostEvent` — Friend's new post. Agent generates a comment (or `<empty-response/>` to skip). Posts via platform API.
   - `processPostCommentEvent` — Comment on a post. Same skip-or-reply pattern.

4. **`src/runtime.ts`** — Singleton holding the `PluginRuntime` reference (provided by OpenClaw at registration) and a path→handler map for webhook dispatch.

5. **`src/accounts.ts`** — Multi-account config resolution. Accounts are defined under `channels.amiko.accounts` in OpenClaw config. Supports fallback from per-account fields to top-level fields.

6. **`src/api.ts`** / **`src/send.ts`** — HTTP client for outbound messages to amiko-chat API (`/api/internal/openclaw/amiko/messages`).

7. **`contracts/`** — JSON Schemas for webhook payloads, outbound messages, config, and ack responses.

## Key Concepts

- **Twin Token**: JWT with `clawd-` prefix, authenticates API calls to amiko-chat. Configured per-account.
- **Reply modes**: `as_owner` (agent writes as the human owner, first person) vs `as_agent` (agent uses its own persona).
- **`replyExpected`**: When false, inbound messages are recorded to session context without triggering agent inference.
- **`<empty-response/>`**: Sentinel value the agent returns to skip commenting on a post.
- The plugin depends on OpenClaw's runtime services (`channel.reply`, `channel.session`, `channel.routing`) passed via `register()`.

## TypeScript

- ESM-only (`"type": "module"`), target ES2022, `NodeNext` module resolution.
- `strict: false` in tsconfig.
- Build excludes `*.test.ts`, `src/m0/**`, and `src/types/**/*.d.ts`.
- Import paths use `.js` extensions (required for NodeNext).
- Peer dependency: `openclaw` SDK. Runtime types are in `src/runtime.ts` (`PluginRuntime`) and `src/types/openclaw-sdk.d.ts`.
