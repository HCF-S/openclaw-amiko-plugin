# M0 Design Freeze — Artifact Index

Milestone: **M0 — Design Freeze**
Date: 2026-03-09
Status: **Signed off**

This directory contains the M0 design-freeze artifacts for the `openclaw-amiko-plugin`. All documents and contracts here represent the agreed-upon boundaries between the plugin and `amiko-platform` before implementation begins. No breaking changes to these contracts may be made without a corresponding revision tracked in changelog.

---

## Documents

| File | Contract ID | Title | Status |
|------|-------------|-------|--------|
| [`channel-config-contract.md`](./channel-config-contract.md) | OCP-001 | Channel Config Contract | Signed off |
| [`platform-api-contract.md`](./platform-api-contract.md) | OCP-002 | Platform API Client Contract | Signed off |
| [`session-key-convention.md`](./session-key-convention.md) | OCP-003 | Session Key Convention | Signed off |

## Machine-Readable Contracts

The canonical JSON Schemas live in [`../../contracts/`](../../contracts/). These are the normative source of truth for payload validation in tests and implementation.

| File | Describes |
|------|-----------|
| [`channel-config.schema.json`](../../contracts/channel-config.schema.json) | `channels.amiko` config block |
| [`platform-events.schema.json`](../../contracts/platform-events.schema.json) | `GET /internal/openclaw/amiko/events` response |
| [`platform-ack.schema.json`](../../contracts/platform-ack.schema.json) | `POST /internal/openclaw/amiko/acks` request body |
| [`platform-outbound.schema.json`](../../contracts/platform-outbound.schema.json) | `POST /internal/openclaw/amiko/messages` request body |

---

## Scope of Design Freeze

The following decisions are frozen at M0 and may not be changed without a documented revision:

1. **Config shape** — `channels.amiko` key, `accounts.<accountId>` multi-account pattern, required/optional field list (OCP-001).
2. **Transport endpoints** — paths, HTTP methods, query parameters, and response envelopes for all three internal API routes (OCP-002).
3. **Event payload structure** — field names and types for `message.text`, `message.image`, and `participant.added` event types (OCP-002).
4. **Cursor semantics** — opaque string, monotonic per account, passed as query param and returned in response (OCP-002).
5. **Idempotency key** — format, required/optional, server behavior on duplicate (OCP-002).
6. **Session key format** — `amiko:<accountId>:direct:<conversationId>` and `amiko:<accountId>:group:<conversationId>` (OCP-003).
7. **accountId normalization rules** — lower-case, trimmed, alphanumeric+hyphen, max 64 chars (OCP-003).

---

## Revision Policy

- Additive changes to optional fields in schemas: allowed without a new contract ID.
- New required fields: require a minor-version bump and migration note.
- Breaking field renames or removals: require a new contract ID revision suffix (e.g. `OCP-001r1`) and explicit sign-off.

---

## Related Planning Documents

- Comprehensive plan: [`../../AMIKO_CHANNEL_COMPREHENSIVE_PLAN.md`](../../AMIKO_CHANNEL_COMPREHENSIVE_PLAN.md)
- Execution checklist: [`../../AMIKO_CHANNEL_EXECUTION_CHECKLIST.md`](../../AMIKO_CHANNEL_EXECUTION_CHECKLIST.md)
- Reference channel notes: [`../../amiko-channel.md`](../../amiko-channel.md)
