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
  };
};

export type HttpRouteOptions = {
  path: string;
  auth: "plugin" | "gateway";
  match?: "exact" | "prefix";
  replaceExisting?: boolean;
  handler: (req: any, res: any) => boolean | Promise<boolean>;
};

export type RegisterHttpRouteFn = (opts: HttpRouteOptions) => void;

let runtime: PluginRuntime | null = null;
let registerHttpRouteFn: RegisterHttpRouteFn | null = null;

export function setAmikoRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getAmikoRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Amiko runtime not initialized");
  return runtime;
}

export function setAmikoRegisterHttpRoute(fn: RegisterHttpRouteFn): void {
  registerHttpRouteFn = fn;
}

export function getAmikoRegisterHttpRoute(): RegisterHttpRouteFn {
  if (!registerHttpRouteFn) throw new Error("Amiko registerHttpRoute not initialized");
  return registerHttpRouteFn;
}
