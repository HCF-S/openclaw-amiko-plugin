# Channel Config Contract

Contract ID: **OCP-001**
Milestone: M0 — Design Freeze
Date: 2026-03-09
Status: **Signed off**

---

## 1. Overview

This document defines the finalized configuration schema for the `amiko` channel in OpenClaw. The config block lives under the top-level `channels` key in the OpenClaw config file:

```
channels.amiko
```

The schema supports both **single-account** and **multi-account** deployments using a base-config + per-account override pattern that is consistent with other OpenClaw channel plugins (e.g. `extensions/zalo`).

The normative JSON Schema is at [`../../contracts/channel-config.schema.json`](../../contracts/channel-config.schema.json).

---

## 2. Config Key Layout

```
channels:
  amiko:
    # --- Base / default account fields ---
    token: <string>
    name: <string>
    enabled: <boolean>
    dmPolicy: allowlist | open | disabled
    allowFrom: [<userId>, ...]
    groupPolicy: disabled | allowlist | open
    groupAllowFrom: [<userId>, ...]

    # --- Multi-account support ---
    defaultAccount: <accountId>
    accounts:
      <accountId>:
        token: <string>
        name: <string>
        enabled: <boolean>
        dmPolicy: allowlist | open | disabled
        allowFrom: [<userId>, ...]
        groupPolicy: disabled | allowlist | open
        groupAllowFrom: [<userId>, ...]
```

---

## 3. Field Reference

### 3.1 Account-Level Fields

These fields apply to both the base config (single-account or default values) and to each entry under `accounts.<accountId>`.

#### `token`

| Attribute | Value |
|-----------|-------|
| Type | `string` |
| Required | Yes (for an account to be considered configured) |
| Sensitive | Yes — treated as a secret; masked in logs and UI |
| UI hint | `sensitive: true` |

The Bearer token used to authenticate outbound requests to `amiko-platform`'s internal API. Must be kept secret. Supports direct string value or SecretRef-compatible materialization path (resolved at runtime by the OpenClaw secrets layer).

An account is considered **not configured** if `token` is absent or an empty/whitespace-only string. Unconfigured accounts are excluded from the active runtime but do not cause a startup error.

#### `name`

| Attribute | Value |
|-----------|-------|
| Type | `string` |
| Required | No |
| Default | `undefined` (display falls back to `accountId`) |

Human-readable label for this account. Used in status output (`openclaw channels status`) and log context. Does not affect routing behavior.

#### `enabled`

| Attribute | Value |
|-----------|-------|
| Type | `boolean` |
| Required | No |
| Default | `true` |

When set to `false`, the account is excluded from gateway startup and inbound polling. The account still resolves for `inspectAccount` read-only operations. Setting `enabled: false` at the base level disables all accounts unless a per-account entry explicitly sets `enabled: true`.

#### `dmPolicy`

| Attribute | Value |
|-----------|-------|
| Type | `"allowlist" \| "open" \| "disabled"` |
| Required | No |
| Default | `"allowlist"` |

Controls which external users may initiate a direct message conversation with the agent.

| Value | Behavior |
|-------|----------|
| `"allowlist"` | Only user IDs listed in `allowFrom` may send DMs. All others are silently ignored. |
| `"open"` | Any user may send a DM. Use with caution in public deployments. |
| `"disabled"` | No DMs are processed. Inbound direct messages are dropped without a reply. |

When `dmPolicy` is `"allowlist"` and `allowFrom` is empty, no DMs are processed (equivalent to `"disabled"`). This is the safe default for new deployments.

#### `allowFrom`

| Attribute | Value |
|-----------|-------|
| Type | `string[]` |
| Required | No |
| Default | `[]` |

Array of platform user IDs permitted to send direct messages when `dmPolicy` is `"allowlist"`. Each entry is trimmed before comparison. Normalization is case-sensitive (platform user IDs are treated as opaque strings).

Hint surfaced to operators on blocked DM: "Add the sender's user ID to `channels.amiko.allowFrom`".

#### `groupPolicy`

| Attribute | Value |
|-----------|-------|
| Type | `"disabled" \| "allowlist" \| "open"` |
| Required | No |
| Default | `"disabled"` |

Controls whether the agent responds in group conversations.

| Value | Behavior |
|-------|----------|
| `"disabled"` | Agent ignores all group messages, even those with a @mention. |
| `"allowlist"` | Agent responds only to group messages from users in `groupAllowFrom`, and only when @mentioned. |
| `"open"` | Agent responds to any @mentioned message in any group conversation. |

Note: regardless of `groupPolicy`, an @mention is always required in group chats (`resolveRequireMention: () => true`). `groupPolicy` adds a sender-level gate on top of the mention requirement.

#### `groupAllowFrom`

| Attribute | Value |
|-----------|-------|
| Type | `string[]` |
| Required | No |
| Default | `[]` |

Array of platform user IDs whose @mentions in group chats will be processed when `groupPolicy` is `"allowlist"`. Trimmed before comparison.

---

### 3.2 Top-Level (Multi-Account) Fields

These fields appear only at the `channels.amiko` level (not inside per-account entries).

#### `defaultAccount`

| Attribute | Value |
|-----------|-------|
| Type | `string` |
| Required | No |
| Default | First key in `accounts` alphabetically, or `"default"` if `accounts` is absent |

The account ID to use when no explicit account context is provided (e.g. in routing decisions and `resolveDefaultAmikoAccountId`). Must match a key in `accounts` if `accounts` is present.

If `accounts` is absent, the entire `channels.amiko` base config is treated as a single implicit account with ID `"default"`.

#### `accounts`

| Attribute | Value |
|-----------|-------|
| Type | `Record<string, AccountConfig>` |
| Required | No |

Named map of account configurations. Each key is an `accountId` (see normalization rules in OCP-003). Each value is an account config object with the same fields listed in section 3.1.

Per-account fields **override** (not merge with) the base config fields when resolving a specific account. Fields absent from the per-account entry fall back to the base config value.

---

## 4. Account Resolution Rules

### 4.1 Single-Account Mode

When `accounts` is absent or empty, the plugin operates in single-account mode. The entire `channels.amiko` block is treated as a single account with ID `"default"`. The `token` field at the base level is the credential for this account.

### 4.2 Multi-Account Mode

When `accounts` is present and non-empty:

1. Each key in `accounts` is a distinct `accountId`.
2. The resolved account config is computed by:
   - Starting with the base `channels.amiko` fields as defaults.
   - Overlaying the per-account entry fields (any field present in the account entry replaces the base value; absent fields keep the base value).
3. `defaultAccount` determines which account ID is selected when no explicit account is requested.
4. The `enabled` flag is evaluated after merging. An account is included in the active runtime only if `enabled !== false`.

### 4.3 `listAccountIds` Behavior

- Returns sorted keys of `channels.amiko.accounts` if non-empty.
- Returns `["default"]` if `accounts` is absent or empty.

### 4.4 `isConfigured` Predicate

An account is considered configured if and only if `token` is a non-empty, non-whitespace string after resolution.

---

## 5. UI Hints

The following fields carry `uiHints` metadata in the plugin manifest for use by setup UIs and `openclaw channels status`:

| Field | Hint |
|-------|------|
| `token` | `sensitive: true` — value is masked in all output and must not be logged |

---

## 6. Validation Behavior

- Unknown keys in `channels.amiko` or in any account entry are **rejected** (strict mode, no passthrough).
- `dmPolicy` and `groupPolicy` values outside the defined enums are rejected at config load time.
- An array entry in `allowFrom` or `groupAllowFrom` that is not a string is rejected.
- `enabled: false` at the base level does not prevent schema validation of account entries.

---

## 7. Sample Configurations

### 7.1 Single-Account (Minimal)

```yaml
channels:
  amiko:
    token: "amk_live_abc123"
    dmPolicy: open
```

### 7.2 Single-Account (Fully Specified)

```yaml
channels:
  amiko:
    token: "amk_live_abc123"
    name: "Amiko Bot (Production)"
    enabled: true
    dmPolicy: allowlist
    allowFrom:
      - "user_1a2b3c"
      - "user_4d5e6f"
    groupPolicy: allowlist
    groupAllowFrom:
      - "user_1a2b3c"
```

### 7.3 Multi-Account

```yaml
channels:
  amiko:
    # Base defaults (applied to accounts that don't override)
    dmPolicy: allowlist
    groupPolicy: disabled
    defaultAccount: "prod"

    accounts:
      prod:
        token: "amk_live_prod_xyz"
        name: "Production Account"
        enabled: true
        dmPolicy: allowlist
        allowFrom:
          - "user_1a2b3c"
          - "user_4d5e6f"

      staging:
        token: "amk_live_staging_abc"
        name: "Staging Account"
        enabled: true
        dmPolicy: open
        groupPolicy: open
```

### 7.4 Disabled Account (Safe Default)

```yaml
channels:
  amiko:
    token: "amk_live_abc123"
    enabled: false
```

---

## 8. SecretRef Support

The `token` field supports SecretRef-compatible values where the runtime secrets layer materializes the actual token before the account is handed to the gateway. The config schema accepts any string at parse time; token emptiness is evaluated after materialization.

Example (platform-specific SecretRef syntax):

```yaml
channels:
  amiko:
    token: "secretref://vault/amiko/prod-token"
```

---

## 9. Config Prefix for Hot-Reload

The channel registers `configPrefixes: ["channels.amiko"]`. Any change under this prefix triggers a channel reload without full process restart.

---

## 10. Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-09 | Initial M0 sign-off |
