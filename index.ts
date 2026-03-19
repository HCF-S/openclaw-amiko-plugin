import { listAmikoAccountIds, resolveAmikoAccount } from "./src/accounts.js";
import { amikoPlugin } from "./src/channel.js";
import { dispatchWebhookRequest, setAmikoRuntime } from "./src/runtime.js";

export default {
  id: "amiko",
  name: "Amiko",
  description: "Connect OpenClaw bot to Amiko platform (direct and group chat via webhook)",

  configSchema: {},

  register(api: {
    runtime: any;
    config?: any;
    registerChannel: (params: { plugin: any }) => void;
    registerHttpRoute?: (params: any) => void;
    registerHttpHandler?: (handler: (req: any, res: any) => boolean | Promise<boolean>) => void;
  }) {
    setAmikoRuntime(api.runtime);
    api.registerChannel({ plugin: amikoPlugin });

    const sendChannelNotStarted = (res: any) => {
      const json = JSON.stringify({ ok: false, error: "Amiko channel not started yet" });
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Length", Buffer.byteLength(json));
      res.end(json);
    };

    const registeredPaths = new Set<string>();
    const cfg = api.config ?? {};
    for (const accountId of listAmikoAccountIds(cfg)) {
      try {
        const account = resolveAmikoAccount({ cfg, accountId });
        const webhookPath = account.config.webhookPath ?? `/amiko/webhook/${account.twinId}`;
        if (registeredPaths.has(webhookPath)) continue;
        registeredPaths.add(webhookPath);

        api.registerHttpRoute?.({
          path: webhookPath,
          auth: "plugin",
          match: "exact",
          replaceExisting: true,
          handler: async (req: any, res: any) => {
            const handled = await dispatchWebhookRequest(req, res);
            if (handled) return true;
            sendChannelNotStarted(res);
            return true;
          },
        });
      } catch {
        // Skip malformed accounts; startAccount/status will surface the real error.
      }
    }

    api.registerHttpHandler?.(async (req: any, res: any) => {
      const handled = await dispatchWebhookRequest(req, res);
      if (handled) return true;

      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      if (!pathname.startsWith("/amiko/webhook/")) return false;

      sendChannelNotStarted(res);
      return true;
    });
  },
};

// Named exports for programmatic use
export { amikoPlugin } from "./src/channel.js";
export { setAmikoRuntime, getAmikoRuntime } from "./src/runtime.js";
export type { ResolvedAmikoAccount, AmikoConfig, AmikoAccountConfig } from "./src/types.js";
