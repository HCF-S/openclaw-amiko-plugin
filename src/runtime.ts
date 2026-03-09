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

let runtime: PluginRuntime | null = null;

export function setAmikoRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getAmikoRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Amiko runtime not initialized");
  return runtime;
}
