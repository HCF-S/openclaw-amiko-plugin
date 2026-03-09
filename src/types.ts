export type AmikoAccountConfig = {
  name?: string;
  enabled?: boolean;
  token?: string;
  apiBaseUrl?: string;
  dmPolicy?: "allowlist" | "open" | "disabled";
  allowFrom?: string[];
  groupPolicy?: "disabled" | "allowlist" | "open";
  groupAllowFrom?: string[];
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};

export type AmikoConfig = {
  accounts?: Record<string, AmikoAccountConfig>;
  defaultAccount?: string;
} & AmikoAccountConfig;

export type ResolvedAmikoAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  apiBaseUrl: string;
  config: AmikoAccountConfig;
};

// Platform API types

export type AmikoEventType = "message.text" | "message.image" | "participant.added";

export type AmikoInboundEvent = {
  id: string;
  type: AmikoEventType;
  accountId: string;
  conversationId: string;
  conversationType: "direct" | "group";
  senderId: string;
  senderName: string;
  timestamp: number; // Unix ms
  cursor: string;
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  mentionsBot?: boolean;
};

export type AmikoEventsResponse = {
  events: AmikoInboundEvent[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AmikoAckPayload = {
  accountId: string;
  cursor: string;
  eventIds: string[];
};

export type AmikoOutboundPayload = {
  accountId: string;
  conversationId: string;
  idempotencyKey: string;
  type: "text" | "media";
  text: string;
  mediaUrl?: string;
  mediaCaption?: string;
};

export type AmikoOutboundResponse = {
  ok: boolean;
  messageId?: string;
  error?: string;
  retriable?: boolean;
};

export type AmikoSendResult =
  | {
      ok: true;
      messageId?: string;
    }
  | {
      ok: false;
      retriable: boolean;
      error: string;
    };
