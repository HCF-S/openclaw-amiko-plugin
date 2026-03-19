import type { ResolvedAmikoAccount } from "./types.js";
import { AmikoConfigSchema } from "./config-schema.js";
import {
  listAmikoAccountIds,
  resolveAmikoAccount,
  resolveDefaultAmikoAccountId,
} from "./accounts.js";
import { sendTextAmiko, sendMediaAmiko } from "./send.js";
import { probeAmikoAccount, buildAmikoAccountSnapshot, inspectAmikoAccount } from "./status.js";
import { getAmikoRegisterHttpRoute, getAmikoRuntime } from "./runtime.js";

// buildChannelConfigSchema is a no-op wrapper in this standalone plugin;
// the real implementation is provided by the OpenClaw SDK at runtime.
function buildChannelConfigSchema<T>(schema: T): T {
  return schema;
}

export const amikoPlugin = {
  id: "amiko",

  meta: {
    id: "amiko",
    label: "Amiko",
    selectionLabel: "Amiko (Webhook)",
    docsPath: "/channels/amiko",
    blurb: "Connect OpenClaw to Amiko platform for direct and group chat via webhook.",
    order: 90,
  },

  capabilities: {
    chatTypes: ["direct", "group"] as const,
    media: true,
    reactions: false,
    threads: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: false,
  },

  reload: {
    configPrefixes: ["channels.amiko"],
  },

  configSchema: buildChannelConfigSchema(AmikoConfigSchema),

  config: {
    listAccountIds(cfg: unknown) {
      return listAmikoAccountIds(cfg as Parameters<typeof listAmikoAccountIds>[0]);
    },

    resolveAccount(cfg: unknown, accountId: string): ResolvedAmikoAccount {
      return resolveAmikoAccount({ cfg: cfg as any, accountId });
    },

    defaultAccountId(cfg: unknown): string {
      return resolveDefaultAmikoAccountId(cfg as Parameters<typeof resolveDefaultAmikoAccountId>[0]);
    },

    isConfigured(account: ResolvedAmikoAccount): boolean {
      return Boolean(account.token?.trim());
    },

    describeAccount(account: ResolvedAmikoAccount) {
      return buildAmikoAccountSnapshot(account);
    },

    inspectAccount(account: ResolvedAmikoAccount): Record<string, unknown> {
      return inspectAmikoAccount(account);
    },
  },

  security: {
    resolveDmPolicy(_params: { account: ResolvedAmikoAccount }) {
      return {
        policy: "open" as const,
        allowFrom: ["*"],
        allowFromPath: "channels.amiko.accounts",
        approveHint: "DM and group access are controlled by Amiko conversations.",
        normalizeEntry: (e: string) => e.trim(),
      };
    },
  },

  groups: {
    resolveRequireMention(): boolean {
      return true;
    },
  },

  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 4_000,
    chunkerMode: "markdown" as const,

    async sendText({ to, text, account }: { to: string; text: string; account: ResolvedAmikoAccount; cfg: unknown; accountId: string }) {
      console.log(`[amiko:outbound] sendText to=${to} textLen=${text?.length}`);
      const result = await sendTextAmiko(to, text, account);
      console.log(`[amiko:outbound] sendText result:`, result);
      return result;
    },

    async sendMedia({ to, text, mediaUrl, account }: { to: string; text: string; mediaUrl: string; cfg: unknown; accountId: string; account: ResolvedAmikoAccount }) {
      return sendMediaAmiko(to, text, mediaUrl, undefined, account);
    },
  },

  status: {
    async probeAccount({ account }: { account: ResolvedAmikoAccount }) {
      return probeAmikoAccount(account);
    },

    buildAccountSnapshot({ account }: { account: ResolvedAmikoAccount; runtime: unknown }) {
      return buildAmikoAccountSnapshot(account);
    },
  },

  gateway: {
    async startAccount(ctx: {
      account: ResolvedAmikoAccount;
      accountId: string;
      cfg: unknown;
      runtime: any;
      abortSignal: AbortSignal;
      setStatus: (patch: any) => void;
    }) {
      const { monitorAmikoProvider } = await import("./monitor.js");
      return monitorAmikoProvider({
        account: ctx.account,
        config: ctx.cfg,
        runtime: getAmikoRuntime(),
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
        registerHttpRoute: getAmikoRegisterHttpRoute(),
      });
    },
  },
};
