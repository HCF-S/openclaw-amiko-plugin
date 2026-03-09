# Session Key Convention

Contract ID: **OCP-003**
Milestone: M0 — Design Freeze
Date: 2026-03-09
Status: **Signed off**

---

## 1. Overview

Session keys are the stable identifiers used by OpenClaw to associate inbound messages with agent sessions and conversation history. This document defines the session key format for the `amiko` channel and the normalization rules that guarantee uniqueness.

---

## 2. Key Format

### 2.1 Direct Conversation

```
amiko:<accountId>:direct:<conversationId>
```

### 2.2 Group Conversation

```
amiko:<accountId>:group:<conversationId>
```

### 2.3 Examples

| Scenario | Session Key |
|----------|-------------|
| Default account, DM from user Alice | `amiko:default:direct:conv_9ab8c7d6` |
| "prod" account, group chat | `amiko:prod:group:conv_4f5e6d7c` |
| "staging" account, DM | `amiko:staging:direct:conv_1a2b3c4d` |

---

## 3. Component Definitions

### 3.1 Channel Prefix: `amiko`

Fixed string. Scopes all keys to this channel, preventing collision with session keys from other channels (e.g. `zalo:`, `matrix:`).

### 3.2 `accountId`

The normalized account identifier:
- Source: key in `channels.amiko.accounts`, or `"default"` for single-account mode.
- Normalization: lowercase + trim. See section 4 for full normalization rules.
- Guarantees: no two accounts resolve to the same normalized accountId.

### 3.3 Conversation Type: `direct` | `group`

Derived from `conversationType` in the inbound event:
- `"direct"` for user-to-bot DMs.
- `"group"` for group chat conversations.

The conversation type is part of the key to prevent any (hypothetical) ID collision between a direct conversation and a group conversation with the same `conversationId`.

### 3.4 `conversationId`

The platform-assigned conversation identifier from the inbound event. This is an opaque string; the plugin treats it as-is without transformation (except URI encoding if used in URLs, which is outside session key scope).

---

## 4. AccountId Normalization Rules

| Rule | Specification |
|------|--------------|
| Case | Lowercase only. `"Prod"` → `"prod"`. |
| Trimming | Leading/trailing whitespace stripped. |
| Character set | Alphanumeric + hyphen only: `[a-z0-9-]`. No underscores, dots, slashes. |
| Max length | 64 characters after normalization. |
| Empty / blank | Not allowed. Validation fails at config load time. |
| Reserved | `"default"` is the reserved ID for single-account mode. |

If a user-supplied accountId key in `channels.amiko.accounts` contains uppercase letters, they are lowercased during normalization. If normalization would produce a collision (e.g., `"Prod"` and `"prod"` both present), config validation rejects the config at load time.

---

## 5. Collision Analysis

### 5.1 Cross-Channel Isolation

The `amiko:` prefix prevents any collision with keys from other channels. All OpenClaw channel session keys must use a unique prefix matching the channel ID.

### 5.2 Cross-Account Isolation

The `accountId` segment guarantees that the same conversationId in two different accounts produces different session keys:

```
amiko:prod:direct:conv_123    ≠    amiko:staging:direct:conv_123
```

### 5.3 Cross-Conversation-Type Isolation

The `direct` / `group` segment prevents collision if the platform ever reuses the same ID across conversation types:

```
amiko:prod:direct:conv_123    ≠    amiko:prod:group:conv_123
```

### 5.4 Uniqueness Proof

A session key uniquely identifies a conversation if and only if:
1. The channel prefix is unique (guaranteed by channel registration).
2. The accountId is unique within the channel (guaranteed by config validation).
3. The conversationId is unique within an account and conversation type (guaranteed by the platform identity model).

---

## 6. Platform Conversation Identity Model

The `amiko-platform` assigns conversationIds per:
- Direct: one conversation per (user, bot-account) pair. Stable across reconnects.
- Group: one conversation per group chat. Stable across membership changes.

ConversationIds are:
- Assigned at conversation creation.
- Stable for the lifetime of the conversation.
- Globally unique within the platform (not just per account).

This means there is no risk of conversationId reuse within an account, and the `accountId` segment in the session key is the primary collision-prevention mechanism across multiple configured accounts.

---

## 7. Session Key Construction (Code Reference)

The session key is constructed in `src/monitor.ts` when routing an inbound event:

```typescript
function buildSessionKey(accountId: string, conversationType: "direct" | "group", conversationId: string): string {
  return `amiko:${accountId}:${conversationType}:${conversationId}`;
}
```

This matches the `peer.kind` field used in `resolveInboundRouteEnvelopeBuilderWithRuntime`:

```typescript
peer: { kind: event.conversationType, id: event.conversationId }
```

The OpenClaw runtime constructs the session key internally from the channel ID + peer, matching the format defined here.

---

## 8. Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-09 | Initial M0 sign-off |
