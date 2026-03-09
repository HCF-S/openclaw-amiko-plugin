# Amiko Channel Execution Checklist (Ticket-Ready)

Date: 2026-03-09  
Source plan: `AMIKO_CHANNEL_COMPREHENSIVE_PLAN.md`

## 1. Usage

- Use this file as the implementation board seed.
- Each item is ticket-ready: scope, outputs, dependencies, acceptance.
- Suggested prefixes:
  - `OCP-*` for `openclaw-amiko-plugin`
  - `AMP-*` for `amiko-platform`
  - `CRT-*` for `clawdbot-railway-template`
  - `REL-*` for rollout/release tasks

## 2. Milestone Map

- M0: Design freeze
- M1: Plugin skeleton + outbound send
- M2: Inbound polling + routing/security
- M3: Platform migration (hybrid)
- M4: Production cutover + cleanup

## M0 Status In This Repo

- [x] `OCP-001` finalized in `docs/m0/channel-config-contract.md`
- [x] `OCP-002` finalized in `docs/m0/platform-api-contract.md`
- [x] `OCP-003` finalized in `docs/m0/session-key-convention.md`

## 3. Tickets by Repository

## 3.1 `openclaw-amiko-plugin` (OCP)

### M0 - Design Freeze

#### OCP-001 - Finalize channel config contract
- Scope: define `channels.amiko` schema (single + multi-account compatibility).
- Output: config doc section + final schema fields list.
- Depends on: none.
- Acceptance:
  - Required fields and optional fields approved.
  - `defaultAccount` and `accounts.<accountId>` behavior explicitly defined.

#### OCP-002 - Finalize platform API client contract
- Scope: request/response contracts for `/events`, `/acks`, `/messages`.
- Output: payload examples and error model.
- Depends on: `AMP-001`.
- Acceptance:
  - Event cursor format finalized.
  - Idempotency and retry behavior documented.

#### OCP-003 - Define session key convention
- Scope: direct/group key composition rules.
- Output: spec note in repo docs.
- Depends on: `AMP-002`.
- Acceptance:
  - No collision across accounts/conversations.
  - Matches platform conversation identity model.

### M1 - Skeleton + Outbound

#### OCP-010 - Scaffold plugin package
- Scope: create `package.json`, `openclaw.plugin.json`, `index.ts`, `src/*` skeleton.
- Output: buildable plugin module.
- Depends on: `OCP-001`.
- Acceptance:
  - `openclaw` discovers plugin by manifest.
  - `openclaw plugins info amiko` succeeds.

#### OCP-011 - Implement `config-schema.ts`
- Scope: Zod schema + `buildChannelConfigSchema` wiring.
- Output: strict validation for `channels.amiko`.
- Depends on: `OCP-010`.
- Acceptance:
  - Invalid keys rejected.
  - Sensitive fields marked via `uiHints` in manifest.

#### OCP-012 - Implement account resolution helpers
- Scope: `listAccountIds`, `resolveDefaultAccountId`, `resolveAccount`, enabled filtering.
- Output: `accounts.ts` + tests.
- Depends on: `OCP-011`.
- Acceptance:
  - Top-level and accounts-based config both resolve correctly.
  - Disabled accounts excluded from runtime startup.

#### OCP-013 - Implement outbound `sendText`
- Scope: platform API client + send adapter mapping to channel `outbound.sendText`.
- Output: `api.ts`, `send.ts`.
- Depends on: `OCP-002`, `OCP-012`.
- Acceptance:
  - Success/timeout/retriable/fatal paths mapped to channel send result.
  - Idempotency key included in outbound request.

#### OCP-014 - Implement status probe and account snapshot
- Scope: `status.probeAccount`, snapshot fields, diagnostics.
- Output: `status.ts` (or inline in `channel.ts`).
- Depends on: `OCP-013`.
- Acceptance:
  - `openclaw channels status --probe` reports configured/healthy/unhealthy correctly.

#### OCP-015 - Implement `inspectAccount` read-only support
- Scope: add non-runtime credential/materialization reporting.
- Output: read-only status-safe account inspection.
- Depends on: `OCP-011`.
- Acceptance:
  - `status`, `doctor`, and resolve flows do not require full secret materialization.

### M2 - Inbound Polling + Security

#### OCP-020 - Implement polling monitor lifecycle
- Scope: polling loop, abort handling, jittered backoff, stop cleanup.
- Output: `monitor.ts` polling engine.
- Depends on: `OCP-002`, `OCP-012`.
- Acceptance:
  - Clean start/stop under gateway lifecycle.
  - No busy-loop on repeated API failure.

#### OCP-021 - Implement cursor checkpointing
- Scope: store/resume cursor safely across restarts.
- Output: cursor state strategy in plugin runtime/session store.
- Depends on: `OCP-020`, `AMP-003`.
- Acceptance:
  - Restart resumes from last acknowledged cursor.
  - Replay does not create duplicate agent replies.

#### OCP-022 - Implement inbound event -> OpenClaw envelope mapping
- Scope: route resolution + envelope builder + session recording.
- Output: direct/group inbound handling.
- Depends on: `OCP-020`, `OCP-003`.
- Acceptance:
  - Direct messages route with `peer.kind=direct`.
  - Group messages route with `peer.kind=group`.

#### OCP-023 - Implement DM authorization policy
- Scope: `security.resolveDmPolicy` and sender authorization resolution.
- Output: DM policy enforcement (`allowlist|open|disabled`).
- Depends on: `OCP-022`.
- Acceptance:
  - Unauthorized DM senders do not trigger agent response.

#### OCP-024 - Implement group access + mention gating
- Scope: group policy checks, allowlists, mention-required behavior.
- Output: `group-access.ts` and channel `groups` adapter.
- Depends on: `OCP-022`.
- Acceptance:
  - Non-mention group messages are ignored by default.
  - Allowlist policy is enforced for group senders.

#### OCP-025 - Implement outbound media capability flag
- Scope: optional `sendMedia` support with safe fallbacks.
- Output: media send path (can be disabled by config).
- Depends on: `OCP-013`.
- Acceptance:
  - If media unsupported/unavailable, plugin degrades to text safely.

#### OCP-026 - Add observability primitives
- Scope: structured logs and core counters/timers.
- Output: log schema + metrics emission hooks.
- Depends on: `OCP-020`.
- Acceptance:
  - Logs include `accountId`, `conversationId`, `eventId`, `cursor`, route type.

### Testing and Quality

#### OCP-030 - Unit tests for schema + account resolution
- Scope: config and account behavior tests.
- Depends on: `OCP-011`, `OCP-012`.
- Acceptance: deterministic pass in CI.

#### OCP-031 - Unit tests for DM/group policy
- Scope: auth and mention policy tests.
- Depends on: `OCP-023`, `OCP-024`.
- Acceptance: unauthorized cases blocked, authorized cases pass.

#### OCP-032 - Integration tests for poll/ack/replay
- Scope: mock API polling and dedupe scenarios.
- Depends on: `OCP-020`, `OCP-021`, `OCP-022`.
- Acceptance: replayed events do not duplicate outbound responses.

#### OCP-033 - Packaging + install smoke test
- Scope: local npm pack install flow test.
- Depends on: `OCP-010`..`OCP-032`.
- Acceptance:
  - Fresh OpenClaw instance installs plugin and starts channel successfully.

## 3.2 `amiko-platform` (AMP)

### M0 - Contract + Data Model

#### AMP-001 - Define internal API contract for plugin integration
- Scope: endpoints `/events`, `/acks`, `/messages`, auth, error codes.
- Output: API spec doc + shared types.
- Depends on: none.
- Acceptance: approved by platform + plugin owners.

#### AMP-002 - Conversation identity mapping spec
- Scope: mapping between conversation rows and channel session identifiers.
- Output: mapping rules doc.
- Depends on: none.
- Acceptance: direct/group mapping is deterministic.

#### AMP-003 - Event queue persistence design
- Scope: DB model for ordered per-account events + ack cursor.
- Output: migration design.
- Depends on: `AMP-001`.
- Acceptance: supports at-least-once delivery and replay window.

### M3 - Backend Migration

#### AMP-010 - Implement event queue tables and migrations
- Scope: DB schema + indexes for event delivery.
- Output: applied migration and repository/DAO layer.
- Depends on: `AMP-003`.
- Acceptance: query latency and write throughput acceptable in staging.

#### AMP-011 - Build `GET /internal/openclaw/amiko/events`
- Scope: account-scoped polling endpoint.
- Output: paginated ordered events with cursor.
- Depends on: `AMP-010`.
- Acceptance:
  - Cursor monotonicity guaranteed.
  - Auth and account scoping enforced.

#### AMP-012 - Build `POST /internal/openclaw/amiko/acks`
- Scope: ack processed events/cursor.
- Output: durable ack update endpoint.
- Depends on: `AMP-010`.
- Acceptance: stale/invalid cursor rejected safely.

#### AMP-013 - Build `POST /internal/openclaw/amiko/messages`
- Scope: accept outbound plugin messages and persist/fanout.
- Output: outbound ingest endpoint.
- Depends on: `AMP-002`.
- Acceptance:
  - Idempotency key dedupe implemented.
  - Message appears in conversation timeline once.

#### AMP-014 - Feature flag transport switch
- Scope: introduce `AMIKO_CHAT_TRANSPORT` modes (`websocket|hybrid|polling`).
- Output: runtime flag handling in services.
- Depends on: `AMP-011`..`AMP-013`.
- Acceptance: mode toggle works without redeploy-risky code edits.

#### AMP-015 - Keep WebSocket compatibility in hybrid mode
- Scope: preserve existing WS broadcast while polling path is enabled.
- Output: dual-path compatibility.
- Depends on: `AMP-014`.
- Acceptance: no functional regression in existing `/chat` flow during ramp.

### Frontend/UX Migration

#### AMP-020 - Abstract message transport in frontend chat hooks
- Scope: refactor `useWebSocket` hard dependency into transport adapter.
- Output: transport layer interface (`ws`, `polling`, optional `sse`).
- Depends on: `AMP-014`.
- Acceptance: same UI behavior under WS and hybrid modes.

#### AMP-021 - Polling-based receive path for user/group conversations
- Scope: periodic fetch + dedupe + incremental merge.
- Output: polling transport implementation.
- Depends on: `AMP-011`, `AMP-020`.
- Acceptance: new messages appear reliably in active conversation views.

#### AMP-022 - Typing/read fallback strategy for non-WS mode
- Scope: lightweight periodic state sync for typing/read indicators.
- Output: parity behavior definitions and implementation.
- Depends on: `AMP-021`.
- Acceptance: no major UX break in polling mode.

### Testing and Reliability

#### AMP-030 - Integration tests for events/ack/message APIs
- Scope: backend integration tests including auth and cursor behavior.
- Depends on: `AMP-011`..`AMP-013`.
- Acceptance: all core happy/error paths covered.

#### AMP-031 - End-to-end tests for direct + group chat in hybrid mode
- Scope: conversation creation, send, receive, mentions.
- Depends on: `AMP-021`, `AMP-022`.
- Acceptance: pass in staging CI.

#### AMP-032 - Legacy route audit (`/amiko-chat` vs `/chat`)
- Scope: verify active traffic and codepaths before removal changes.
- Depends on: none.
- Acceptance: documented migration decision with concrete removal date or compatibility policy.

## 3.3 `clawdbot-railway-template` (CRT)

### M3 - Deployment Automation

#### CRT-001 - Add plugin install/update setup endpoint
- Scope: endpoint to run `openclaw plugins install <npmSpec>` for `amiko`.
- Output: setup API extension with logs and error mapping.
- Depends on: `OCP-033`.
- Acceptance: plugin can be installed/updated remotely through setup API.

#### CRT-002 - Add plugin enable + config write endpoint
- Scope: write `plugins.entries.amiko.enabled=true` and `channels.amiko` JSON.
- Output: idempotent config workflow.
- Depends on: `CRT-001`, `OCP-001`.
- Acceptance: resulting config validated and persisted.

#### CRT-003 - Add channel health probe endpoint
- Scope: run `openclaw channels status --probe` and return parsed output.
- Output: setup API health utility.
- Depends on: `CRT-002`.
- Acceptance: setup UI can show amiko channel health.

#### CRT-004 - Integrate plugin deploy into existing init/deploy chain
- Scope: include Amiko channel setup in init flow where appropriate.
- Output: optional automated plugin setup during provisioning.
- Depends on: `CRT-001`..`CRT-003`.
- Acceptance: new instance can become Amiko-channel-ready with one setup action.

#### CRT-005 - Document operational runbook updates
- Scope: update `SETUP_API.md` and relevant docs for new endpoints.
- Depends on: `CRT-004`.
- Acceptance: docs include request payloads and troubleshooting.

### Testing

#### CRT-010 - Setup API integration tests for plugin endpoints
- Scope: test install/config/probe sequence.
- Depends on: `CRT-001`..`CRT-003`.
- Acceptance: CI pass with deterministic outputs.

#### CRT-011 - Docker/railway smoke for plugin provisioning
- Scope: e2e bootstrap in containerized env.
- Depends on: `CRT-010`.
- Acceptance: clean instance provisions plugin and reports healthy channel.

## 3.4 Release and Operations (REL)

### M4 - Cutover

#### REL-001 - Staging rollout plan and cohort definition
- Scope: define 10/25/50/100 ramp cohorts and duration.
- Depends on: `OCP-032`, `AMP-031`, `CRT-011`.
- Acceptance: signed-off go-live checklist.

#### REL-002 - Dashboards and alerts
- Scope: wire metrics/log panels and alerts for poll errors, latency, auth failures.
- Depends on: `OCP-026`, `AMP-030`.
- Acceptance: on-call can detect channel degradation quickly.

#### REL-003 - Rollback drill
- Scope: simulate return to `websocket` mode and plugin disable path.
- Depends on: `REL-001`.
- Acceptance: rollback completes within agreed recovery time objective.

#### REL-004 - Production cutover
- Scope: switch default transport to polling after staged success.
- Depends on: `REL-001`..`REL-003`.
- Acceptance: 7-day stability window with no P0 incidents.

#### REL-005 - Legacy cleanup and deprecation notices
- Scope: remove or formally deprecate WS-only codepaths and services.
- Depends on: `REL-004`, `AMP-032`.
- Acceptance: deprecated components have owner, timeline, and removal PRs.

## 4. Suggested Sprint Sequencing

- Sprint 1: `OCP-001..015`, `AMP-001..003`, `AMP-032`
- Sprint 2: `OCP-020..026`, `OCP-030..032`, `AMP-010..015`
- Sprint 3: `AMP-020..031`, `CRT-001..005`, `CRT-010`
- Sprint 4: `CRT-011`, `REL-001..005`, `OCP-033`

## 5. Definition of Done (Global)

- Direct and group flows pass E2E in staging and production pilot.
- Channel health probing is automated in setup/deploy paths.
- Transport can switch between `websocket`, `hybrid`, and `polling` safely.
- Rollback is tested, documented, and operationally acceptable.
- Docs in all 3 repos are updated and internally reviewed.
