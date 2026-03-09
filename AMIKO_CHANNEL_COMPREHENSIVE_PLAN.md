# Amiko OpenClaw Channel Comprehensive Plan

Date: 2026-03-09  
Owner: Infra/Agent Platform (OpenClaw + Amiko)

## 1. Objective

Build a production-ready custom OpenClaw plugin (`amiko` channel) that is usable immediately and designed for future expansion (skills + model router provider), while replacing the current WebSocket-centered messaging path in `amiko-platform` for direct and group chat flows.

## 2. Success Criteria

1. `openclaw-amiko-plugin` can be installed as a standalone npm plugin and enabled via OpenClaw config.
2. Direct chat and group chat both work end-to-end through the new `amiko` channel.
3. Initial inbound delivery uses polling (MVP), with clean upgrade path to webhook.
4. `amiko-platform` can run without depending on the current `amiko-chat` WebSocket service for core message delivery.
5. Deployment template (`clawdbot-railway-template`) can auto-install/update the plugin and apply config through setup APIs.
6. Clear extension points exist for future `amiko` skills and an Amiko model-router provider plugin.

## 3. Scope

### In Scope

- New plugin package/repo structure under `openclaw-amiko-plugin`.
- Custom `amiko` channel registration with account config, outbound send, inbound receive.
- Polling-based inbound event ingestion from `amiko-platform`.
- Support both chat types:
  - direct (user <-> user/agent)
  - group (`/amiko-chat` semantics and/or active group conversation mode)
- Migration plan from WebSocket transport to HTTP polling/event API in `amiko-platform`.
- Deployment automation in `clawdbot-railway-template`.

### Out of Scope (Phase 1)

- Voice/video calls.
- Full realtime streaming transport redesign beyond message/typing/read basics.
- Model-router runtime implementation (only extension hooks and package boundaries now).

## 4. Current-State Summary (Validated)

- `openclaw-amiko-plugin` currently only has `README.md` and reference draft `amiko-channel.md`.
- `amiko-platform` currently uses `amiko-chat` WebSocket service for real-time fanout and room events.
- Chat V2 docs indicate `/chat` is active and group behavior exists in conversation flows; `/amiko-chat` may be legacy by route name, so migration must support both naming conventions.
- `clawdbot-railway-template` already automates OpenClaw setup and channel config for built-in channels; it is the right place to automate plugin install/config for `amiko`.

## 5. Target Architecture (Phase 1 MVP)

### 5.1 Channel Model

- OpenClaw plugin id: `amiko`
- Channel config key: `channels.amiko`
- Multi-account shape: `channels.amiko.accounts.<accountId>`
- Delivery mode: direct send APIs to platform
- Inbound mode (MVP): polling against authenticated Amiko internal API

### 5.2 Transport Contracts (Platform <-> Plugin)

- `GET /internal/openclaw/amiko/events?accountId=<id>&cursor=<c>&limit=<n>`
  - returns ordered inbound events (direct + group)
- `POST /internal/openclaw/amiko/acks`
  - acknowledges processed event ids/cursor
- `POST /internal/openclaw/amiko/messages`
  - outbound delivery from plugin to platform (agent replies, system messages)

Contract requirements:
- At-least-once delivery with idempotency key.
- Monotonic cursor per account.
- Stable event id for dedupe.

### 5.3 Message Routing Rules

- Direct chats:
  - `peer.kind = "direct"`
  - DM policy from `channels.amiko.*`
- Group chats:
  - `peer.kind = "group"`
  - mention required by default (`resolveRequireMention: () => true`)
  - sender allowlist/group policy enforcement

### 5.4 Session Key Standard

Use deterministic session key format to avoid collisions:
- `amiko:<accountId>:direct:<conversationId>`
- `amiko:<accountId>:group:<conversationId>`

## 6. Workstreams

### 6.1 Workstream A: Plugin Foundation (`openclaw-amiko-plugin`)

Deliverables:
- `package.json` with `openclaw.extensions`
- `openclaw.plugin.json`
- `index.ts`
- `src/` modules:
  - `channel.ts`
  - `config-schema.ts`
  - `types.ts`
  - `accounts.ts`
  - `send.ts`
  - `monitor.ts`
  - `group-access.ts`
  - `runtime.ts`
  - `api.ts` (platform HTTP client)
  - `status.ts` (probe/health)

Engineering requirements:
- Follow `extensions/zalo` patterns from OpenClaw where applicable.
- Implement `inspectAccount` for read-only command reliability.
- Config schema includes ui hints for sensitive fields.
- Secrets accepted via direct value or SecretRef-compatible materialization path.

### 6.2 Workstream B: Inbound/Outbound Core Logic

Inbound (polling first):
- Poll loop with backoff + jitter.
- Cursor persistence and resume on restart.
- Process event types:
  - `message.text`
  - `message.image` (optional in phase 1, but preserve contract)
  - `participant.added` (group bootstrap, optional)

Outbound:
- `sendText` implemented first.
- `sendMedia` behind capability flag.
- Chunking and markdown-safe splitting.

Security/authorization:
- DM policy (`allowlist|open|disabled`).
- Group policy (`allowlist|open|disabled`).
- Sender normalization and allowlist evaluation.

### 6.3 Workstream C: `amiko-platform` Transport Migration

Backend:
- Introduce event queue table for channel events (or reuse existing durable queue infra).
- Add the three internal endpoints for plugin polling/ack/outbound send.
- Add idempotency handling for outbound writes.
- Keep legacy WebSocket endpoints active under feature flag during migration.

Frontend (`amiko-web`):
- Replace hard dependency on WebSocket hooks for core message receive with polling/SSE abstraction.
- Keep typing/read UX by lightweight periodic sync initially.
- Preserve existing conversation UI and APIs.

Service retirement path:
- Move from `AMIKO_CHAT_TRANSPORT=websocket` -> `hybrid` -> `polling`.
- Decommission `amiko-chat` only after stability SLO is met.

### 6.4 Workstream D: Deployment Integration (`clawdbot-railway-template`)

Add setup automation:
- Install/update plugin package (`openclaw plugins install <npmSpec>`).
- Enable plugin entry (`plugins.entries.amiko.enabled=true`).
- Write channel config under `channels.amiko`.
- Gateway restart hooks after config changes.

Setup API extensions:
- Add endpoint to configure Amiko channel credentials and API base URL.
- Add endpoint to run plugin health probe (`openclaw channels status --probe`).

### 6.5 Workstream E: Future Extensibility Boundaries

Repository layout (target):
- `packages/channel-amiko` (now)
- `skills/amiko` (next)
- `packages/provider-amiko-router` (future)

Versioning strategy:
- Independent semver for channel package.
- Changelog with migration notes for config shape changes.

## 7. Milestones and Acceptance Criteria

### M0 - Design Freeze (1-2 days)

- Finalize API contract between plugin and platform.
- Finalize config schema and account model.
- Decide cursor persistence storage location.

Exit criteria:
- Signed-off contract doc and sample payloads.

### M1 - Plugin Skeleton + Config + Send (2-3 days)

- Plugin loads via OpenClaw.
- `channels.amiko` validation works.
- `sendText` can deliver to platform mock endpoint.

Exit criteria:
- `openclaw plugins info amiko` succeeds.
- Unit tests for config/accounts/send pass.

### M2 - Inbound Polling + Direct/Group Routing (3-5 days)

- Poller receives messages and feeds OpenClaw runtime.
- DM/group policies enforced.
- Mention gating in groups works.

Exit criteria:
- End-to-end tests pass for direct and group flows.
- No duplicate reply on replayed events.

### M3 - Platform Migration (5-7 days)

- Internal event APIs live in `amiko-platform`.
- Frontend runs in hybrid mode without regressions.
- Legacy WebSocket path still available as fallback.

Exit criteria:
- 0 P0 regressions in chat core flows for 72h in staging.

### M4 - Production Cutover + Cleanup (2-3 days)

- Set transport to polling primary.
- Monitor SLO and error budgets.
- Remove obsolete WS-only code paths (or mark deprecated with removal date).

Exit criteria:
- Stable operation for 7 days.
- Rollback plan verified.

## 8. Test Plan

Unit tests:
- Config schema validation.
- Account resolution/default account behavior.
- Group/DM policy evaluation.
- Outbound error mapping and retries.

Integration tests:
- Polling cursor/ack behavior.
- Duplicate event handling.
- Auth failure, token rotation, transient API failures.

E2E tests:
- Direct chat send/receive.
- Group chat mention-required send/receive.
- Agent response appears in platform conversation timeline.

Operational tests:
- Restart resilience (no cursor loss).
- High-volume polling burst and backpressure behavior.

## 9. Observability and Operations

Required metrics:
- `amiko_poll_requests_total`
- `amiko_poll_errors_total`
- `amiko_events_processed_total`
- `amiko_events_deduped_total`
- `amiko_outbound_send_total`
- `amiko_outbound_send_failures_total`
- `amiko_end_to_end_latency_ms`

Required logs:
- accountId, conversationId, eventId, cursor, route type (direct/group), dedupe decision.

Alerts:
- Poll error rate > 5% for 5m.
- End-to-end p95 latency > target threshold.
- Consecutive auth failures per account.

## 10. Rollout and Rollback

Rollout:
1. Deploy plugin + APIs in staging.
2. Enable hybrid mode for internal test users.
3. Ramp by cohort (10% -> 25% -> 50% -> 100%).
4. Switch default transport to polling.

Rollback:
- Toggle transport back to WebSocket immediately (`AMIKO_CHAT_TRANSPORT=websocket`).
- Disable plugin entry (`plugins.entries.amiko.enabled=false`) if channel instability occurs.
- Preserve queue data for replay after recovery.

## 11. Risks and Mitigations

1. Duplicate messages due to at-least-once delivery.
- Mitigation: deterministic idempotency key and dedupe table with TTL.

2. Polling latency impacts UX.
- Mitigation: short poll interval + adaptive backoff + optimistic UI on send.

3. Config drift across many deployed agents.
- Mitigation: setup API automation and periodic config audit endpoint.

4. Ambiguity around `/amiko-chat` active route usage.
- Mitigation: add compatibility mapping and validate real traffic before hard removal.

## 12. Immediate Next Actions (This Week)

1. Approve API contract payloads for events/acks/messages.
2. Scaffold plugin package and commit M1 skeleton.
3. Implement mock platform adapter + integration tests in this repo.
4. Add setup API hooks in `clawdbot-railway-template` for plugin install/config.
5. Build `amiko-platform` internal endpoints behind feature flag and start staging hybrid tests.
