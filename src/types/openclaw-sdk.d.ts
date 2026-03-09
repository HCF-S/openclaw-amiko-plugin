declare module "openclaw/plugin-sdk" {
  export const DEFAULT_ACCOUNT_ID: string;

  export function normalizeAccountId(id: string): string;
  export function normalizeOptionalAccountId(id: string | undefined): string | undefined;
  export function isNormalizedSenderAllowed(params: { senderId: string; allowFrom: string[] }): boolean;

  export function buildChannelConfigSchema<T>(schema: T): T;
  export function emptyPluginConfigSchema(): unknown;

  export type DmPolicy = "allowlist" | "open" | "disabled";
  export type GroupPolicy = "disabled" | "allowlist" | "open";

  export interface PeerRef {
    kind: "direct" | "group";
    id: string;
  }

  export interface RouteRef {
    sessionKey: string;
    peer: PeerRef;
  }

  export interface InboundEnvelope {
    channel: string;
    from: string;
    timestamp: number;
    body: string;
    attachments?: Array<{ type: string; url: string; caption?: string }>;
  }

  export interface ChannelReplyApi {
    finalizeInboundContext(params: unknown): unknown;
    dispatchReplyWithBufferedBlockDispatcher(params: unknown): Promise<void>;
  }

  export interface ChannelSessionApi {
    recordInboundSession(params: { storePath: string; sessionKey: string; ctx: unknown }): Promise<void>;
  }

  export interface ChannelRuntimeApi {
    reply: ChannelReplyApi;
    session: ChannelSessionApi;
  }

  export interface CoreApi {
    channel: ChannelRuntimeApi;
  }

  export interface PluginRuntime {
    core: CoreApi;
  }

  export interface DmPolicyResult {
    policy: DmPolicy;
    allowFrom: string[];
    allowFromPath: string;
    approveHint: string;
    normalizeEntry: (e: string) => string;
  }

  export interface GroupAccessParams {
    senderId: string;
    groupId: string;
    policy: GroupPolicy;
    allowFrom: string[];
    requireMention: boolean;
    mentionFound: boolean;
  }

  export interface GroupAccessResult {
    allowed: boolean;
    reason: string;
  }

  export function evaluateSenderGroupAccess(params: GroupAccessParams & {
    isSenderAllowed: (senderId: string, allowFrom: string[]) => boolean;
  }): GroupAccessResult;

  export function resolveInboundRouteEnvelopeBuilderWithRuntime(params: {
    cfg: unknown;
    channel: string;
    accountId: string;
    peer: PeerRef;
    runtime: ChannelRuntimeApi;
    sessionStore?: unknown;
  }): {
    route: RouteRef;
    buildEnvelope: (envelope: InboundEnvelope) => { storePath: string; body: unknown };
  };

  export function resolveDirectDmAuthorizationOutcome(params: {
    dmPolicy: DmPolicyResult;
    senderId: string;
    senderAllowedForCommands: boolean;
    commandAuthorized: boolean;
  }): "authorized" | "unauthorized" | "disabled";

  export function resolveSenderCommandAuthorizationWithRuntime(params: {
    cfg: unknown;
    senderId: string;
    runtime: ChannelRuntimeApi;
  }): Promise<{ senderAllowedForCommands: boolean; commandAuthorized: boolean }>;

  export interface AccountSnapshot {
    accountId: string;
    name?: string;
    enabled: boolean;
    configured: boolean;
    [key: string]: unknown;
  }

  export interface ProbeResult {
    status: "healthy" | "unhealthy" | "unconfigured";
    message?: string;
    latencyMs?: number;
  }

  export interface ChannelCapabilities {
    chatTypes: Array<"direct" | "group">;
    media: boolean;
    reactions: boolean;
    threads: boolean;
    polls: boolean;
    nativeCommands: boolean;
    blockStreaming: boolean;
  }

  export interface ChannelMeta {
    id: string;
    label: string;
    selectionLabel: string;
    docsPath: string;
    blurb: string;
    order: number;
  }

  export interface SendTextParams<TAccount> {
    to: string;
    text: string;
    cfg: unknown;
    accountId: string;
    account: TAccount;
  }

  export interface SendMediaParams<TAccount> {
    to: string;
    text: string;
    mediaUrl: string;
    cfg: unknown;
    accountId: string;
    account: TAccount;
  }

  export type SendResult =
    | { ok: true; messageId?: string }
    | { ok: false; retriable: boolean; error: string };

  export interface ChannelPlugin<TAccount> {
    id: string;
    meta: ChannelMeta;
    capabilities: ChannelCapabilities;
    reload: { configPrefixes: string[] };
    configSchema: unknown;
    config: {
      listAccountIds(cfg: unknown): string[];
      resolveAccount(cfg: unknown, accountId: string): TAccount;
      defaultAccountId(cfg: unknown): string;
      isConfigured(account: TAccount): boolean;
      describeAccount(account: TAccount): AccountSnapshot;
      inspectAccount?(account: TAccount): Record<string, unknown>;
    };
    security: {
      resolveDmPolicy(params: { account: TAccount }): DmPolicyResult;
    };
    groups: {
      resolveRequireMention(): boolean;
    };
    outbound: {
      deliveryMode: "direct";
      textChunkLimit: number;
      chunkerMode: "markdown" | "plain";
      sendText(params: SendTextParams<TAccount>): Promise<SendResult>;
      sendMedia?(params: SendMediaParams<TAccount>): Promise<SendResult>;
    };
    status: {
      probeAccount(params: { account: TAccount }): Promise<ProbeResult>;
      buildAccountSnapshot(params: { account: TAccount; runtime: PluginRuntime }): AccountSnapshot;
    };
    gateway: {
      startAccount(ctx: {
        account: TAccount;
        accountId: string;
        cfg: unknown;
        runtime: PluginRuntime;
        abortSignal: AbortSignal;
        setStatus: (patch: Partial<ProbeResult> & { accountId: string }) => void;
      }): Promise<{ stop: () => void }>;
    };
  }

  export interface OpenClawPluginApi {
    runtime: PluginRuntime;
    registerChannel(params: { plugin: ChannelPlugin<unknown> }): void;
  }

  export interface OpenClawPlugin {
    id: string;
    name: string;
    description: string;
    configSchema: unknown;
    register(api: OpenClawPluginApi): void;
  }
}
