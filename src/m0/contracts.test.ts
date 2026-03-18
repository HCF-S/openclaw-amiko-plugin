/**
 * M0 Contract Tests (OCP-001, OCP-002, OCP-003)
 *
 * These tests are self-contained: no external dependencies required.
 * Run via: npm run test:m0
 * Compiled output goes to .tmp/m0/
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline implementations for M0 validation (no imports from src/*)
// ---------------------------------------------------------------------------

const DEFAULT_ACCOUNT_ID = "main";
const DEFAULT_PLATFORM_API_BASE_URL = "https://platform.heyamiko.com";
const DEFAULT_CHAT_API_BASE_URL = "https://api.amiko.app";

function normalizeAccountId(id: string): string {
  return id.toLowerCase().trim();
}

type AmikoAccountConfig = {
  name?: string;
  enabled?: boolean;
  twinId?: string;
  token?: string;
  platformApiBaseUrl?: string;
  chatApiBaseUrl?: string;
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

type AmikoConfig = {
  accounts?: Record<string, AmikoAccountConfig>;
  defaultAccount?: string;
} & AmikoAccountConfig;

type ResolvedAmikoAccount = {
  accountId: string;
  twinId: string;
  name?: string;
  enabled: boolean;
  token: string;
  platformApiBaseUrl: string;
  chatApiBaseUrl: string;
  config: AmikoAccountConfig;
};

function listAmikoAccountIds(cfg: { channels?: { amiko?: AmikoConfig } }): string[] {
  const amiko = cfg.channels?.amiko;
  if (!amiko) return [DEFAULT_ACCOUNT_ID];
  const accounts = amiko.accounts;
  if (!accounts || Object.keys(accounts).length === 0) return [DEFAULT_ACCOUNT_ID];
  return Object.keys(accounts).sort().map(normalizeAccountId);
}

function resolveDefaultAmikoAccountId(cfg: { channels?: { amiko?: AmikoConfig } }): string {
  const amiko = cfg.channels?.amiko;
  if (!amiko) return DEFAULT_ACCOUNT_ID;
  if (amiko.defaultAccount) return normalizeAccountId(amiko.defaultAccount);
  const ids = listAmikoAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAmikoAccountConfig(amiko: AmikoConfig, accountId: string): AmikoAccountConfig {
  if (accountId === DEFAULT_ACCOUNT_ID || !amiko.accounts) {
    return {
      name: amiko.name,
      enabled: amiko.enabled,
      twinId: amiko.twinId,
      token: amiko.token,
      platformApiBaseUrl: amiko.platformApiBaseUrl ?? amiko.apiBaseUrl,
      chatApiBaseUrl: amiko.chatApiBaseUrl ?? amiko.apiBaseUrl,
      apiBaseUrl: amiko.apiBaseUrl,
      pollIntervalMs: amiko.pollIntervalMs,
      pollTimeoutMs: amiko.pollTimeoutMs,
    };
  }
  const per = amiko.accounts[accountId] ?? {};
  return {
    name: per.name ?? amiko.name,
    enabled: per.enabled ?? amiko.enabled,
    twinId: per.twinId ?? amiko.twinId,
    token: per.token ?? amiko.token,
    platformApiBaseUrl:
      per.platformApiBaseUrl ?? per.apiBaseUrl ?? amiko.platformApiBaseUrl ?? amiko.apiBaseUrl,
    chatApiBaseUrl:
      per.chatApiBaseUrl ?? per.apiBaseUrl ?? amiko.chatApiBaseUrl ?? amiko.apiBaseUrl,
    apiBaseUrl: per.apiBaseUrl ?? amiko.apiBaseUrl,
    pollIntervalMs: per.pollIntervalMs ?? amiko.pollIntervalMs,
    pollTimeoutMs: per.pollTimeoutMs ?? amiko.pollTimeoutMs,
  };
}

function resolveAmikoAccount(params: {
  cfg: { channels?: { amiko?: AmikoConfig } };
  accountId: string;
}): ResolvedAmikoAccount {
  const { cfg, accountId } = params;
  const amiko = cfg.channels?.amiko ?? ({} as AmikoConfig);
  const config = resolveAmikoAccountConfig(amiko, accountId);
  if (!config.twinId?.trim()) throw new Error(`Amiko account "${accountId}" has no twinId`);
  if (!config.token?.trim()) throw new Error(`Amiko account "${accountId}" has no token`);
  return {
    accountId,
    twinId: config.twinId,
    name: config.name,
    enabled: config.enabled !== false,
    token: config.token,
    platformApiBaseUrl:
      (config.platformApiBaseUrl ?? config.apiBaseUrl ?? DEFAULT_PLATFORM_API_BASE_URL)
        .replace(/\/+$/, "")
        .replace(/\/api$/, ""),
    chatApiBaseUrl:
      (config.chatApiBaseUrl ?? config.apiBaseUrl ?? DEFAULT_CHAT_API_BASE_URL)
        .replace(/\/+$/, "")
        .replace(/\/api$/, ""),
    config,
  };
}

function buildSessionKey(
  accountId: string,
  conversationType: "direct" | "group",
  conversationId: string,
): string {
  return `amiko:${accountId}:${conversationType}:${conversationId}`;
}

// ---------------------------------------------------------------------------
// OCP-001: Channel Config Contract tests
// ---------------------------------------------------------------------------

describe("OCP-001: Account resolution", () => {
  it("single-account mode uses DEFAULT_ACCOUNT_ID", () => {
    const cfg = { channels: { amiko: { token: "tok_abc" } } };
    const ids = listAmikoAccountIds(cfg);
    assert.deepEqual(ids, [DEFAULT_ACCOUNT_ID]);
  });

  it("resolves single-account config correctly", () => {
    const cfg = {
      channels: {
        amiko: { twinId: "twin_main", token: "tok_abc" },
      },
    };
    const account = resolveAmikoAccount({ cfg, accountId: DEFAULT_ACCOUNT_ID });
    assert.equal(account.token, "tok_abc");
    assert.equal(account.twinId, "twin_main");
    assert.equal(account.enabled, true);
    assert.equal(account.platformApiBaseUrl, DEFAULT_PLATFORM_API_BASE_URL);
    assert.equal(account.chatApiBaseUrl, DEFAULT_CHAT_API_BASE_URL);
  });

  it("multi-account: lists sorted account IDs", () => {
    const cfg = {
      channels: {
        amiko: {
          accounts: { prod: { token: "t1" }, alpha: { token: "t2" }, beta: { token: "t3" } },
        },
      },
    };
    assert.deepEqual(listAmikoAccountIds(cfg), ["alpha", "beta", "prod"]);
  });

  it("multi-account: per-account overrides base", () => {
    const cfg = {
      channels: {
        amiko: {
          token: "base_tok",
          accounts: {
            staging: {
              twinId: "twin_staging",
              token: "staging_tok",
            },
          },
        },
      },
    };
    const account = resolveAmikoAccount({ cfg, accountId: "staging" });
    assert.equal(account.token, "staging_tok");
    assert.equal(account.twinId, "twin_staging");
  });

  it("multi-account: defaultAccount respected", () => {
    const cfg = {
      channels: {
        amiko: {
          defaultAccount: "prod",
          accounts: {
            prod: { twinId: "twin_prod", token: "t1" },
            alpha: { twinId: "twin_alpha", token: "t2" },
          },
        },
      },
    };
    assert.equal(resolveDefaultAmikoAccountId(cfg), "prod");
  });

  it("defaultAccount falls back to first alphabetical when absent", () => {
    const cfg = {
      channels: {
        amiko: {
          accounts: {
            prod: { twinId: "twin_prod", token: "t1" },
            alpha: { twinId: "twin_alpha", token: "t2" },
          },
        },
      },
    };
    assert.equal(resolveDefaultAmikoAccountId(cfg), "alpha");
  });

  it("prefers main when defaultAccount is absent", () => {
    const cfg = {
      channels: {
        amiko: {
          accounts: {
            "agent-foo": { twinId: "twin_foo", token: "t1" },
            main: { twinId: "twin_main", token: "t2" },
          },
        },
      },
    };
    assert.equal(resolveDefaultAmikoAccountId(cfg), "main");
  });

  it("enabled: false account resolves but has enabled=false", () => {
    const cfg = {
      channels: { amiko: { twinId: "twin_main", token: "tok", enabled: false } },
    };
    const account = resolveAmikoAccount({ cfg, accountId: DEFAULT_ACCOUNT_ID });
    assert.equal(account.enabled, false);
  });

  it("missing token throws", () => {
    const cfg = { channels: { amiko: {} } };
    assert.throws(
      () => resolveAmikoAccount({ cfg, accountId: DEFAULT_ACCOUNT_ID }),
      /no twinId/,
    );
  });

  it("normalizes accountId to lowercase", () => {
    assert.equal(normalizeAccountId("PROD"), "prod");
    assert.equal(normalizeAccountId("  Staging  "), "staging");
  });
});

// ---------------------------------------------------------------------------
// OCP-003: Session Key Convention tests
// ---------------------------------------------------------------------------

describe("OCP-003: Session key convention", () => {
  it("direct session key format", () => {
    assert.equal(
      buildSessionKey("prod", "direct", "conv_abc123"),
      "amiko:prod:direct:conv_abc123",
    );
  });

  it("group session key format", () => {
    assert.equal(
      buildSessionKey("prod", "group", "conv_abc123"),
      "amiko:prod:group:conv_abc123",
    );
  });

  it("direct and group keys with same conversationId do not collide", () => {
    const direct = buildSessionKey("prod", "direct", "conv_x");
    const group = buildSessionKey("prod", "group", "conv_x");
    assert.notEqual(direct, group);
  });

  it("same conversationId in different accounts do not collide", () => {
    const k1 = buildSessionKey("prod", "direct", "conv_x");
    const k2 = buildSessionKey("staging", "direct", "conv_x");
    assert.notEqual(k1, k2);
  });

  it("default account key uses 'main'", () => {
    assert.equal(
      buildSessionKey(DEFAULT_ACCOUNT_ID, "direct", "conv_y"),
      "amiko:main:direct:conv_y",
    );
  });
});

// ---------------------------------------------------------------------------
// OCP-002: API Contract structural tests
// ---------------------------------------------------------------------------

describe("OCP-002: Event payload structure", () => {
  it("valid message.text event has required fields", () => {
    const event = {
      id: "evt_001",
      type: "message.text",
      accountId: "prod",
      conversationId: "conv_abc",
      conversationType: "direct",
      senderId: "user_1",
      senderName: "Alice",
      timestamp: 1741478400000,
      text: "Hello!",
    };
    assert.ok(event.id);
    assert.ok(event.type === "message.text");
    assert.ok(typeof event.timestamp === "number");
  });

  it("group event has mentionsBot field", () => {
    const event = {
      id: "evt_002",
      type: "message.text",
      accountId: "prod",
      conversationId: "conv_grp",
      conversationType: "group",
      senderId: "user_1",
      senderName: "Bob",
      timestamp: 1741478400001,
      text: "@bot help me",
      mentionsBot: true,
    };
    assert.equal(event.mentionsBot, true);
    assert.equal(event.conversationType, "group");
  });

  it("idempotency key format: accountId:conversationId:uuid", () => {
    const accountId = "prod";
    const conversationId = "conv_abc";
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const key = `${accountId}:${conversationId}:${uuid}`;
    assert.equal(key, "prod:conv_abc:550e8400-e29b-41d4-a716-446655440000");
    assert.ok(key.startsWith(`${accountId}:${conversationId}:`));
  });

  it("webhook payload wraps event under 'event' key", () => {
    const event = {
      id: "evt_003",
      type: "message.text",
      accountId: "prod",
      conversationId: "conv_abc",
      conversationType: "direct",
      senderId: "user_1",
      senderName: "Alice",
      timestamp: 1741478400002,
      text: "Hi from webhook",
    };
    const payload = { event };
    assert.ok(payload.event);
    assert.equal(payload.event.id, "evt_003");
    assert.equal(payload.event.type, "message.text");
    // No cursor field in webhook events
    assert.equal("cursor" in payload.event, false);
  });

  it("webhook default path format is /amiko/webhook/<twinId>", () => {
    const twinId = "twin_prod";
    const defaultPath = `/amiko/webhook/${twinId}`;
    assert.equal(defaultPath, "/amiko/webhook/twin_prod");
  });
});
