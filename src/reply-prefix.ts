// Stub for createReplyPrefixOptions — the real function is provided by openclaw/plugin-sdk
// at runtime. This stub satisfies TypeScript compilation in the standalone plugin build.
export type ReplyPrefixOptions = {
  responsePrefix?: string;
  responsePrefixContextProvider?: () => Record<string, unknown>;
  onModelSelected: (ctx: unknown) => void;
};

export function createReplyPrefixOptions(_params: {
  cfg: unknown;
  agentId: string;
  channel?: string;
  accountId?: string;
}): ReplyPrefixOptions {
  // At runtime this is replaced by the real openclaw/plugin-sdk implementation.
  // This stub is only used during standalone typecheck/build.
  return {
    onModelSelected: () => {},
  };
}
