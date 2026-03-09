export type ChannelRuntimeApi = {
  reply: {
    finalizeInboundContext(params: unknown): unknown;
    dispatchReplyWithBufferedBlockDispatcher(params: unknown): Promise<void>;
  };
  session: {
    recordInboundSession(params: {
      storePath: string;
      sessionKey: string;
      ctx: unknown;
    }): Promise<void>;
  };
};

export type PluginRuntime = {
  core: {
    channel: ChannelRuntimeApi;
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
