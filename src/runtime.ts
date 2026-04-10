export type AgentRoute = {
  agentId: string;
  accountId: string;
  sessionKey: string;
};

export type PluginRuntime = {
  channel: {
    reply: {
      finalizeInboundContext(params: unknown): any;
      dispatchReplyWithBufferedBlockDispatcher(params: unknown): Promise<void>;
      formatAgentEnvelope(params: unknown): string;
      resolveEnvelopeFormatOptions(cfg: unknown): unknown;
    };
    session: {
      recordInboundSession(params: {
        storePath: string;
        sessionKey: string;
        ctx: unknown;
        onRecordError: (err: unknown) => void;
      }): Promise<void>;
      resolveStorePath(store: unknown, params: { agentId: string }): string;
      readSessionUpdatedAt(params: { storePath: string; sessionKey: string }): number | undefined;
    };
    routing: {
      resolveAgentRoute(params: {
        cfg: unknown;
        channel: string;
        accountId: string;
        peer: { kind: "direct" | "group"; id: string };
      }): AgentRoute;
    };
    chat?: {
      /** Inject a message into a session transcript without triggering agent inference. */
      inject(params: {
        sessionKey: string;
        message: string;
        label?: string;
      }): Promise<{ ok: boolean; messageId?: string }>;
    };
  };
};

let runtime: PluginRuntime | null = null;
const webhookDispatchers = new Map<string, (req: any, res: any) => Promise<void> | void>();

export function setAmikoRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getAmikoRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Amiko runtime not initialized");
  return runtime;
}

export function setWebhookDispatcher(
  path: string,
  handler: ((req: any, res: any) => Promise<void> | void) | null,
): void {
  if (!path) return;
  if (!handler) {
    webhookDispatchers.delete(path);
    return;
  }
  webhookDispatchers.set(path, handler);
}

export async function dispatchWebhookRequest(req: any, res: any): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  const handler = webhookDispatchers.get(pathname);
  if (!handler) return false;
  await handler(req, res);
  return true;
}
