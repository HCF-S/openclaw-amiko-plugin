import type { ResolvedAmikoAccount } from "./types.js";
import { AmikoConfigSchema } from "./config-schema.js";
import {
  listAmikoAccountIds,
  resolveAmikoAccount,
  resolveDefaultAmikoAccountId,
} from "./accounts.js";
import { sendTextAmiko, sendMediaAmiko } from "./send.js";
import { probeAmikoAccount, buildAmikoAccountSnapshot, inspectAmikoAccount } from "./status.js";
import { getAmikoRuntime, setWebhookDispatcher } from "./runtime.js";

// Local builds use zod v3 while the runtime SDK may use a newer zod type surface.
// Keep this wrapper as a pass-through so the plugin stays buildable across both.
function buildChannelConfigSchema<T>(schema: T): T {
  return schema;
}

const activeRouteUnregisters = new Map<string, () => void>();

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
      return sendTextAmiko(to, text, account);
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
      try {
        const runtime = getAmikoRuntime();

        const { monitorAmikoProvider } = await import("./monitor.js");
        const handle = await monitorAmikoProvider({
          account: ctx.account,
          config: ctx.cfg,
          runtime,
          abortSignal: ctx.abortSignal,
          statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
        });

        const routeKey = `${ctx.accountId}:${handle.webhookPath}`;
        const prevUnregister = activeRouteUnregisters.get(routeKey);
        if (prevUnregister) {
          prevUnregister();
          activeRouteUnregisters.delete(routeKey);
        }

        setWebhookDispatcher(handle.webhookPath, handle.handler);
        activeRouteUnregisters.set(routeKey, () => {
          setWebhookDispatcher(handle.webhookPath, null);
        });

        let stopped = false;
        const stop = () => {
          if (stopped) return;
          stopped = true;
          const unregister = activeRouteUnregisters.get(routeKey);
          unregister?.();
          activeRouteUnregisters.delete(routeKey);
          handle.stop();
        };

        ctx.abortSignal.addEventListener("abort", stop, { once: true });

        return { stop };
      } catch (err) {
        console.error(`[amiko:startAccount] FAILED for account=${ctx.accountId}:`, err);
        throw err;
      }
    },
  },
};
