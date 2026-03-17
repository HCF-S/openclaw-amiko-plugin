# Custom Channel Integration Plan for Social Platform

## Context

Build a custom OpenClaw channel extension so a social platform can integrate the OpenClaw bot:
- Users send DMs to the bot and receive AI-powered replies
- Users add the bot to group chats and interact via @mention
- Follows the same extension pattern as built-in channels (Zalo, Matrix, MS Teams)

**Best reference to copy from:** `extensions/zalo` (simplest polling-based channel)

---

## Phase 1 — Scaffold the Extension Package

Create the directory and marker file:

```
extensions/amiko/
├── package.json
├── index.ts
├── openclaw.plugin.json   ← empty file, required marker
└── src/
    ├── channel.ts
    ├── config-schema.ts
    ├── accounts.ts
    ├── monitor.ts
    ├── send.ts
    ├── group-access.ts
    ├── runtime.ts
    └── types.ts
```

**`package.json`** — copy from `extensions/zalo/package.json`, change:
- `name`: `"@openclaw/amiko"`
- `openclaw.channel.id`: `"amiko"`
- `openclaw.channel.label` / `selectionLabel` / `blurb`
- `openclaw.install.npmSpec` + `localPath`
- Replace Zalo API dependency with your platform's SDK

**`openclaw.plugin.json`** — empty `{}` file.

---

## Phase 2 — Config Schema (`src/config-schema.ts`)

Define a Zod schema for the channel's config section. Pattern: `extensions/zalo/src/config-schema.ts`.

```typescript
import { z } from "zod";

const amikoAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  token: z.string().optional(),
  dmPolicy: z.enum(["allowlist", "open", "disabled"]).optional(),
  allowFrom: z.array(z.string()).optional(),
  groupPolicy: z.enum(["disabled", "allowlist", "open"]).optional(),
  groupAllowFrom: z.array(z.string()).optional(),
});

export const AmikoConfigSchema = amikoAccountSchema.extend({
  accounts: z.object({}).catchall(amikoAccountSchema).optional(),
  defaultAccount: z.string().optional(),
});
```

Use `buildChannelConfigSchema(AmikoConfigSchema)` in `channel.ts`.

---

## Phase 3 — Types (`src/types.ts`)

```typescript
export type AmikoAccountConfig = {
  name?: string;
  enabled?: boolean;
  token?: string;
  dmPolicy?: "allowlist" | "open" | "disabled";
  allowFrom?: string[];
  groupPolicy?: "disabled" | "allowlist" | "open";
  groupAllowFrom?: string[];
};

export type AmikoConfig = {
  accounts?: Record<string, AmikoAccountConfig>;
  defaultAccount?: string;
} & AmikoAccountConfig;

export type ResolvedAmikoAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  config: AmikoAccountConfig;
};
```

---

## Phase 4 — Account Helpers (`src/accounts.ts`)

Functions consumed by the `config` adapter. Pattern: `extensions/zalo/src/accounts.ts`.

- `listAmikoAccountIds(cfg)` — return sorted keys of `config.channels.amiko.accounts`, falling back to `[DEFAULT_ACCOUNT_ID]`
- `resolveDefaultAmikoAccountId(cfg)` — honor `defaultAccount` setting or pick first
- `resolveAmikoAccount({ cfg, accountId })` — merge base config with per-account config, return `ResolvedAmikoAccount`
- `listEnabledAmikoAccounts(cfg)` — filter accounts where `enabled !== false`

Key SDK imports: `DEFAULT_ACCOUNT_ID`, `normalizeAccountId`, `normalizeOptionalAccountId` from `"openclaw/plugin-sdk/zalo"`.

---

## Phase 5 — Outbound / Send (`src/send.ts`)

Wraps platform API calls for outbound delivery.

```typescript
export type AmikoSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export async function sendTextAmiko(
  chatId: string,
  text: string,
  options: { token: string },
): Promise<AmikoSendResult> { ... }

export async function sendMediaAmiko(
  chatId: string,
  mediaUrl: string,
  caption: string,
  options: { token: string },
): Promise<AmikoSendResult> { ... }
```

---

## Phase 6 — Gateway / Monitor (`src/monitor.ts`)

Handles inbound messages. Two options:

### Option A — Polling (simpler, good for MVP)

```typescript
export async function monitorAmikoProvider(options) {
  let offset = 0;
  let stopped = false;

  const poll = async () => {
    if (stopped || options.abortSignal.aborted) return;
    try {
      const updates = await platformApi.getUpdates(options.token, offset);
      for (const update of updates) {
        await processUpdate(update, options);
        offset = update.id + 1;
      }
    } catch (err) {
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!stopped && !options.abortSignal.aborted) setImmediate(poll);
  };

  void poll();
  return { stop: () => { stopped = true; } };
}
```

### Option B — Webhook (preferred for production)

Register a webhook route via the runtime and call the platform API to register the webhook URL.

### `processUpdate` logic (both options)

```typescript
async function processUpdate(update, options) {
  const { core, config, account } = options;
  const isGroup = update.chat.type === "group";
  const chatId = update.chat.id;
  const senderId = update.sender.id;
  const text = update.message.text ?? "";

  // 1. Group access gate
  if (isGroup) {
    const groupAccess = evaluateAmikoGroupAccess({ ... });
    if (!groupAccess.allowed) return;
  }

  // 2. DM authorization gate
  const { senderAllowedForCommands, commandAuthorized } =
    await resolveSenderCommandAuthorizationWithRuntime({ ... });
  const directDmOutcome = resolveDirectDmAuthorizationOutcome({ ... });
  if (directDmOutcome !== "authorized") return;

  // 3. Resolve inbound route + build envelope
  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: config,
    channel: "amiko",
    accountId: account.accountId,
    peer: { kind: isGroup ? "group" : "direct", id: chatId },
    runtime: core.channel,
    sessionStore: config.session?.store,
  });

  const { storePath, body } = buildEnvelope({
    channel: "Amiko",
    from: update.sender.name,
    timestamp: update.timestamp * 1000,
    body: text,
  });

  // 4. Finalize context + record session
  const ctxPayload = core.channel.reply.finalizeInboundContext({ ... });
  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: route.sessionKey,
    ctx: ctxPayload,
  });

  // 5. Dispatch reply
  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      deliver: async (payload) => {
        // chunk + send via sendTextAmiko / sendMediaAmiko
      },
    },
  });
}
```

Key imports from `"openclaw/plugin-sdk/zalo"`: `resolveInboundRouteEnvelopeBuilderWithRuntime`, `resolveDirectDmAuthorizationOutcome`, `resolveSenderCommandAuthorizationWithRuntime`.

---

## Phase 7 — Group Access (`src/group-access.ts`)

Pattern: `extensions/zalo/src/group-access.ts`.

```typescript
export function isAmikoSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  return isNormalizedSenderAllowed({ senderId, allowFrom });
}

export function evaluateAmikoGroupAccess(params) {
  return evaluateSenderGroupAccess({
    ...params,
    isSenderAllowed: isAmikoSenderAllowed,
  });
}
```

---

## Phase 8 — Runtime (`src/runtime.ts`)

Stores the plugin runtime reference (needed by the monitor).

```typescript
let runtime: PluginRuntime | null = null;
export function setAmikoRuntime(next: PluginRuntime) { runtime = next; }
export function getAmikoRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Amiko runtime not initialized");
  return runtime;
}
```

---

## Phase 9 — Main Channel Definition (`src/channel.ts`)

Compose all adapters. Pattern: `extensions/zalo/src/channel.ts`.

```typescript
export const amikoPlugin: ChannelPlugin<ResolvedAmikoAccount> = {
  id: "amiko",
  meta: { id: "amiko", label: "Amiko", selectionLabel: "Amiko (Bot API)",
          docsPath: "/channels/amiko", blurb: "...", order: 90 },

  capabilities: {
    chatTypes: ["direct", "group"],
    media: false,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },

  reload: { configPrefixes: ["channels.amiko"] },
  configSchema: buildChannelConfigSchema(AmikoConfigSchema),

  config: {
    listAccountIds: (cfg) => listAmikoAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveAmikoAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultAmikoAccountId(cfg),
    isConfigured: (account) => Boolean(account.token?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
    }),
  },

  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dmPolicy ?? "allowlist",
      allowFrom: account.config.allowFrom ?? [],
      allowFromPath: "channels.amiko.allowFrom",
      approveHint: "Add the sender's user ID to channels.amiko.allowFrom",
      normalizeEntry: (e) => e.trim(),
    }),
  },

  groups: {
    resolveRequireMention: () => true,
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    chunkerMode: "markdown",
    sendText: async ({ to, text, cfg, accountId }) => { ... },
    sendMedia: async ({ to, text, mediaUrl, cfg, accountId }) => { ... },
  },

  status: {
    probeAccount: async ({ account }) => { ... },
    buildAccountSnapshot: ({ account, runtime }) => ({ ... }),
  },

  gateway: {
    startAccount: async (ctx) => {
      // Dynamic import to avoid mixing static/lazy imports (see CLAUDE.md guardrail)
      const { monitorAmikoProvider } = await import("./monitor.js");
      return monitorAmikoProvider({
        token: ctx.account.token,
        account: ctx.account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
```

---

## Phase 10 — Entry Point (`index.ts`)

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/zalo";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/zalo";
import { amikoPlugin } from "./src/channel.js";
import { setAmikoRuntime } from "./src/runtime.js";

export default {
  id: "amiko",
  name: "My Platform",
  description: "Connect OpenClaw bot to My Platform",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setAmikoRuntime(api.runtime);
    api.registerChannel({ plugin: amikoPlugin });
  },
};
```

---

## Phase 11 — Wire into Core (if shipping as built-in)

1. Add workspace entry in root `package.json` `workspaces`
2. Add to `.github/labeler.yml` with a matching label (follow existing channel label colors)
3. Create GitHub label `channel: amiko`
4. Add docs page at `docs/channels/amiko.md`
5. Reference in `docs/mint.json` nav

---

## Message Flow Summary

```
Platform User
    ↓  (sends message)
Platform API (webhook or polling)
    ↓
monitor.ts → processUpdate()
    ↓
resolveInboundRouteEnvelopeBuilderWithRuntime()
    ↓  (checks: is an agent bound to this chat?)
Security gate:
  DM    → resolveDmPolicy() → allowlist check
  Group → resolveRequireMention() → @mention check
          evaluateAmikoGroupAccess() → sender authorization
    ↓
Agent (LLM) processes message + runs tools
    ↓
outbound.sendText() / sendMedia()
    ↓
Platform API delivers reply to user
```

---

## DM vs Group Chat Behavior

| | Direct Message | Group Chat |
|---|---|---|
| `peer.kind` | `"direct"` | `"group"` |
| Authorization | `security.resolveDmPolicy` | `groups.resolveToolPolicy` |
| Mention required | No | Yes (`resolveRequireMention: () => true`) |
| Bot join event | N/A | Detect in `processUpdate`, send welcome via `sendTextAmiko` |
| Session key | Per user | Per group |

---

## Critical Files to Reference

| File | Purpose |
|---|---|
| `src/channels/plugins/types.plugin.ts` | Full `ChannelPlugin` interface |
| `src/channels/plugins/types.adapters.ts` | All adapter signatures |
| `src/plugin-sdk/index.ts` | SDK exports available to plugins |
| `extensions/zalo/src/channel.ts` | Simplest full channel example |
| `extensions/zalo/src/monitor.ts` | Polling + webhook gateway pattern |
| `extensions/zalo/src/send.ts` | Outbound send pattern |
| `extensions/zalo/src/group-access.ts` | Group policy pattern |
| `extensions/zalo/src/runtime.ts` | Runtime singleton pattern |

---

## Verification Checklist

1. `pnpm install` — workspace picks up the new extension
2. `pnpm build` — no TypeScript errors, no `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings
3. `pnpm tsgo` — strict type check passes
4. `pnpm check` — lint/format clean
5. `openclaw channels status --probe` — shows `amiko` account as healthy
6. Send a DM → verify reply appears
7. Add bot to group, send without @mention → verify no reply
8. Send with @mention in group → verify reply appears
9. `pnpm test` — coverage thresholds pass




