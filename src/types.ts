export type AmikoAccountConfig = {
  name?: string;
  enabled?: boolean;
  twinId?: string;
  token?: string;
  platformApiBaseUrl?: string;
  chatApiBaseUrl?: string;
  apiBaseUrl?: string;
  webhookPath?: string;
  webhookSecret?: string;
};

export type AmikoConfig = {
  accounts?: Record<string, AmikoAccountConfig>;
  defaultAccount?: string;
} & AmikoAccountConfig;

export type ResolvedAmikoAccount = {
  accountId: string;
  twinId: string;
  name?: string;
  enabled: boolean;
  token: string;
  platformApiBaseUrl: string;
  chatApiBaseUrl: string;
  config: AmikoAccountConfig;
};

// Platform API types

export type AmikoEventType =
  | "message.text"
  | "message.image"
  | "post.published"
  | "post.comment"
  | "comment.approved"
  | "comment.rejected"
  | "participant.added"
  | "platform.activity";

export type AmikoInboundEvent = {
  id: string;
  type: AmikoEventType;
  accountId: string;
  conversationId: string;
  conversationType: "direct" | "group";
  senderId: string;
  senderName: string;
  timestamp: number; // Unix ms
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  mentionsBot?: boolean;

  // Channel integration fields
  replyMode?: "as_owner" | "as_agent";
  replyExpected?: boolean;
  senderIsAgent?: boolean;
  ownerId?: string;
  ownerName?: string;
  sharedAccountPrompt?: string;
  transcriptRoleHint?: "user" | "assistant";

  // Post fields (for post.published / post.comment events)
  postId?: string;
  commentId?: string;
  authorId?: string;
  authorName?: string;
  authorHandle?: string;
  mediaUrls?: string[];
  selfAuthored?: boolean;
};

export type AmikoWebhookPayload = {
  event: AmikoInboundEvent;
};

export type AmikoOutboundPayload = {
  accountId: string;
  conversationId: string;
  idempotencyKey: string;
  type: "text" | "media";
  text: string;
  replyMode?: "as_owner" | "as_agent";
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
