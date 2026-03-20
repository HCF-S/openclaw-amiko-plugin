import { createHmac, timingSafeEqual } from "node:crypto";
import type { ResolvedAmikoAccount, AmikoInboundEvent, AmikoWebhookPayload } from "./types.js";
import type { PluginRuntime } from "./runtime.js";
import type { ProbeResult } from "./status.js";
import { sendTextAmiko } from "./send.js";
import { createReplyPrefixOptions } from "./reply-prefix.js";

export type MonitorOptions = {
  account: ResolvedAmikoAccount;
  config: unknown;
  runtime: PluginRuntime;
  abortSignal: AbortSignal;
  statusSink: (patch: Partial<ProbeResult> & { accountId: string }) => void;
};

export type MonitorHandle = {
  stop: () => void;
  webhookPath: string;
  handler: (req: any, res: any) => Promise<void>;
};

function verifyHmacSignature(secret: string, body: string | Buffer, signature: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(typeof body === "string" ? body : body)
    .digest("hex");
  const expectedBuf = Buffer.from(`sha256=${expected}`, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function buildAmikoReplyContext(event: AmikoInboundEvent, account: ResolvedAmikoAccount): string {
  const replyMode = event.replyMode ?? "as_owner";
  const lines = [
    "Amiko reply context:",
    `- Channel account: ${account.accountId}`,
    `- Twin ID: ${account.twinId}`,
    `- Reply mode: ${replyMode}`,
  ];

  if (replyMode === "as_owner") {
    lines.push(
      `- You are replying on behalf of the owner${event.ownerName ? `, ${event.ownerName}` : ""}.`,
      `- Write as the owner in first person. Do not describe yourself as an AI, assistant, or proxy unless the owner explicitly wants that.`,
    );
    if (event.ownerId) {
      lines.push(`- Owner ID: ${event.ownerId}`);
    }
    if (event.sharedAccountPrompt?.trim()) {
      lines.push(`- Shared account prompt: ${event.sharedAccountPrompt.trim()}`);
    }
  } else {
    lines.push(
      "- You are replying as the twin/agent identity, not as the owner.",
      "- Write as that persona directly in first person.",
    );
  }

  if (event.senderName || event.senderId) {
    lines.push(`- Incoming sender: ${event.senderName || event.senderId}`);
  }
  if (event.conversationType) {
    lines.push(`- Conversation type: ${event.conversationType}`);
  }

  return lines.join("\n");
}

// ── Chat message processing ─────────────────────────────────────────────────

async function processChatEvent(
  event: AmikoInboundEvent,
  options: Pick<MonitorOptions, "account" | "config" | "runtime">,
): Promise<void> {
  const { account, runtime: core, config } = options;
  const replyExpected = event.replyExpected !== false;
  const replyMode = event.replyMode ?? "as_owner";

  console.log(
    `[amiko:${account.accountId}] processChatEvent: convId=${event.conversationId} sender=${event.senderName} replyExpected=${replyExpected} replyMode=${replyMode}`,
  );

  const isGroup = event.conversationType === "group";
  const conversationId = event.conversationId;

  const peer = { kind: event.conversationType as "direct" | "group", id: conversationId };

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "amiko",
    accountId: account.accountId,
    peer,
  });

  const storePath = core.channel.session.resolveStorePath(
    (config as any).session?.store,
    { agentId: route.agentId },
  );

  const rawBody = event.text?.trim() ?? "";
  const roleContext = buildAmikoReplyContext(event, account);
  const agentBody = `${roleContext}\n\nIncoming message:\n${rawBody}`.trim();
  const fromLabel = isGroup
    ? `group:${conversationId}`
    : (event.senderName || `user:${event.senderId}`);

  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Amiko",
    from: fromLabel,
    timestamp: event.timestamp,
    previousTimestamp,
    envelope: core.channel.reply.resolveEnvelopeFormatOptions(config),
    body: agentBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: agentBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: isGroup ? `amiko:group:${conversationId}` : `amiko:${event.senderId}`,
    To: `amiko:${conversationId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: event.senderName || undefined,
    SenderId: event.senderId,
    Provider: "amiko",
    Surface: "amiko",
    MessageSid: event.id,
    OriginatingChannel: "amiko",
    OriginatingTo: `amiko:${conversationId}`,
  });

  // ── replyExpected: false → persist context only, no agent response ─────────
  if (!replyExpected) {
    console.log(
      `[amiko:${account.accountId}] recording context only (no reply): ${rawBody.slice(0, 100)}`,
    );

    await core.channel.session.recordInboundSession({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
      onRecordError: (err: unknown) => {
        console.error(`[amiko:${account.accountId}] recordInboundSession error:`, err);
      },
    });
    return;
  }

  // ── replyExpected: true → full agent dispatch ──────────────────────────────

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err: unknown) => {
      console.error(`[amiko:${account.accountId}] recordInboundSession error:`, err);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "amiko",
    accountId: account.accountId,
  });

  console.log(
    `[amiko:${account.accountId}] dispatching reply: sessionKey=${route.sessionKey} replyMode=${replyMode}`,
  );

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: { text?: string; mediaUrl?: string }) => {
        if (payload.text) {
          console.log(
            `[amiko:${account.accountId}] delivering reply (${replyMode}) to ${conversationId}: ${payload.text.slice(0, 100)}`,
          );
          const result = await sendTextAmiko(conversationId, payload.text, account, { replyMode });
          if (!result.ok) {
            console.error(`[amiko:${account.accountId}] sendTextAmiko failed:`, result);
          } else {
            console.log(`[amiko:${account.accountId}] reply delivered ok: messageId=${result.messageId}`);
          }
        }
      },
      onError: (err: unknown, info: { kind: string }) => {
        console.error(`[amiko:${account.accountId}] ${info.kind} reply error:`, err);
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

// ── Post comment processing ─────────────────────────────────────────────────

async function processPostEvent(
  event: AmikoInboundEvent,
  options: Pick<MonitorOptions, "account" | "config" | "runtime">,
): Promise<void> {
  const { account, runtime: core, config } = options;
  const postId = event.postId ?? event.id;
  const authorName = event.authorName ?? event.senderName ?? "Someone";
  const content = event.text?.trim() ?? "";

  console.log(
    `[amiko:${account.accountId}] processPostEvent: postId=${postId} author=${authorName}`,
  );

  if (!content) return;

  const peer = { kind: "direct" as const, id: `post:${postId}` };
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "amiko",
    accountId: account.accountId,
    peer,
  });

  // One-shot session key per post
  const sessionKey = `amiko:${account.accountId}:post:${postId}`;

  const prompt = `Your friend ${authorName} posted:\n\n"${content}"\n\nIf you'd like to comment on this post, write your comment. If you don't want to comment, respond with <empty-response/> only.`;

  const storePath = core.channel.session.resolveStorePath(
    (config as any).session?.store,
    { agentId: route.agentId },
  );

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: prompt,
    BodyForAgent: prompt,
    RawBody: prompt,
    CommandBody: prompt,
    From: `amiko:post:${postId}`,
    To: `amiko:${account.accountId}`,
    SessionKey: sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: `post by ${authorName}`,
    SenderName: authorName,
    SenderId: event.authorId ?? event.senderId,
    Provider: "amiko",
    Surface: "amiko",
    MessageSid: event.id,
    OriginatingChannel: "amiko",
    OriginatingTo: `amiko:post:${postId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey,
    ctx: ctxPayload,
    onRecordError: (err: unknown) => {
      console.error(`[amiko:${account.accountId}] recordInboundSession error (post):`, err);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "amiko",
    accountId: account.accountId,
  });

  console.log(
    `[amiko:${account.accountId}] dispatching post comment: sessionKey=${sessionKey}`,
  );

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: { text?: string }) => {
        if (!payload.text) return;

        const text = payload.text.trim();

        // Agent chose not to comment
        if (text === "<empty-response/>" || text.includes("<empty-response/>")) {
          console.log(`[amiko:${account.accountId}] agent skipped post comment for ${postId}`);
          return;
        }

        // Post comment via amiko-new API
        const commentUrl = `${account.platformApiBaseUrl}/api/posts/${postId}/comments`;
        console.log(
          `[amiko:${account.accountId}] posting comment on ${postId}: ${text.slice(0, 100)}`,
        );

        try {
          const res = await fetch(commentUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${account.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ comment: text }),
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            console.error(
              `[amiko:${account.accountId}] comment POST failed: ${res.status} ${errText.slice(0, 200)}`,
            );
          } else {
            const data = (await res.json()) as { comment?: { id?: string } };
            console.log(
              `[amiko:${account.accountId}] comment posted ok: ${data.comment?.id ?? "unknown"}`,
            );
          }
        } catch (err) {
          console.error(`[amiko:${account.accountId}] comment POST error:`, err);
        }
      },
      onError: (err: unknown, info: { kind: string }) => {
        console.error(`[amiko:${account.accountId}] ${info.kind} post reply error:`, err);
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

async function processPostCommentEvent(
  event: AmikoInboundEvent,
  options: Pick<MonitorOptions, "account" | "config" | "runtime">,
): Promise<void> {
  const { account, runtime: core, config } = options;
  const postId = event.postId ?? event.id;
  const commentId = event.commentId ?? event.id;
  const commenterName = event.senderName ?? event.authorName ?? "Someone";
  const postAuthorName = event.authorName ?? "your friend";
  const content = event.text?.trim() ?? "";

  console.log(
    `[amiko:${account.accountId}] processPostCommentEvent: postId=${postId} commentId=${commentId} commenter=${commenterName}`,
  );

  if (!content) return;

  const peer = { kind: "direct" as const, id: `post:${postId}:comment:${commentId}` };
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "amiko",
    accountId: account.accountId,
    peer,
  });

  const sessionKey = `amiko:${account.accountId}:post:${postId}:comment:${commentId}`;
  const prompt =
    `On a post by ${postAuthorName}, ${commenterName} commented:\n\n` +
    `"${content}"\n\n` +
    `If you'd like to reply in the post comments, write your comment. ` +
    `If you don't want to reply, respond with <empty-response/> only.`;

  const storePath = core.channel.session.resolveStorePath(
    (config as any).session?.store,
    { agentId: route.agentId },
  );

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: prompt,
    BodyForAgent: prompt,
    RawBody: prompt,
    CommandBody: prompt,
    From: `amiko:post:${postId}:comment:${commentId}`,
    To: `amiko:${account.accountId}`,
    SessionKey: sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: `comment by ${commenterName} on post ${postId}`,
    SenderName: commenterName,
    SenderId: event.senderId,
    Provider: "amiko",
    Surface: "amiko",
    MessageSid: event.id,
    OriginatingChannel: "amiko",
    OriginatingTo: `amiko:post:${postId}:comment:${commentId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey,
    ctx: ctxPayload,
    onRecordError: (err: unknown) => {
      console.error(`[amiko:${account.accountId}] recordInboundSession error (post comment):`, err);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "amiko",
    accountId: account.accountId,
  });

  console.log(
    `[amiko:${account.accountId}] dispatching post-comment reply: sessionKey=${sessionKey}`,
  );

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: { text?: string }) => {
        if (!payload.text) return;

        const text = payload.text.trim();
        if (text === "<empty-response/>" || text.includes("<empty-response/>")) {
          console.log(
            `[amiko:${account.accountId}] agent skipped post-comment reply for ${postId}/${commentId}`,
          );
          return;
        }

        const commentUrl = `${account.platformApiBaseUrl}/api/posts/${postId}/comments`;
        console.log(
          `[amiko:${account.accountId}] posting reply comment on ${postId} for comment ${commentId}: ${text.slice(0, 100)}`,
        );

        try {
          const res = await fetch(commentUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${account.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ comment: text }),
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            console.error(
              `[amiko:${account.accountId}] reply comment POST failed: ${res.status} ${errText.slice(0, 200)}`,
            );
          } else {
            const data = (await res.json()) as { comment?: { id?: string } };
            console.log(
              `[amiko:${account.accountId}] reply comment posted ok: ${data.comment?.id ?? "unknown"}`,
            );
          }
        } catch (err) {
          console.error(`[amiko:${account.accountId}] reply comment POST error:`, err);
        }
      },
      onError: (err: unknown, info: { kind: string }) => {
        console.error(`[amiko:${account.accountId}] ${info.kind} post-comment reply error:`, err);
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

// ── Event dispatcher ────────────────────────────────────────────────────────

async function processEvent(
  event: AmikoInboundEvent,
  options: Pick<MonitorOptions, "account" | "config" | "runtime">,
): Promise<void> {
  if (event.type === "post.published") {
    return processPostEvent(event, options);
  }

  if (event.type === "post.comment") {
    return processPostCommentEvent(event, options);
  }

  if (event.type === "message.text" || event.type === "message.image") {
    return processChatEvent(event, options);
  }

  console.log(`[amiko:${options.account.accountId}] ignoring event type: ${event.type}`);
}

// ── Webhook monitor ─────────────────────────────────────────────────────────

export async function monitorAmikoProvider(options: MonitorOptions): Promise<MonitorHandle> {
  const { account, statusSink } = options;
  const webhookPath =
    account.config.webhookPath ?? `/amiko/webhook/${account.twinId}`;
  const webhookSecret = account.config.webhookSecret;

  const handler = async (req: any, res: any) => {
    const sendJson = (statusCode: number, body: unknown) => {
      const json = JSON.stringify(body);
      res.statusCode = statusCode;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Length", Buffer.byteLength(json));
      res.end(json);
    };

    if ((req.method ?? "POST").toUpperCase() !== "POST") {
      sendJson(405, { error: "method not allowed" });
      return;
    }

    const rawBody: Buffer = await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

    if (webhookSecret) {
      const sig = req.headers["x-amiko-signature"] as string | undefined;
      if (!sig) {
        sendJson(401, { error: "missing signature" });
        return;
      }
      if (!verifyHmacSignature(webhookSecret, rawBody, sig)) {
        sendJson(401, { error: "invalid signature" });
        return;
      }
    }

    let payload: AmikoWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as AmikoWebhookPayload;
    } catch {
      sendJson(400, { error: "invalid JSON" });
      return;
    }

    const event = payload?.event;
    if (!event?.id || !event?.type) {
      sendJson(400, { error: "missing event" });
      return;
    }

    sendJson(200, { ok: true });

    try {
      await processEvent(event, options);
      statusSink({ accountId: account.accountId, status: "healthy" });
    } catch (err) {
      console.error(`[amiko:${account.accountId}] Error processing event ${event.id}:`, err);
      statusSink({ accountId: account.accountId, status: "unhealthy", message: String(err) });
    }
  };

  statusSink({ accountId: account.accountId, status: "healthy" });

  return {
    webhookPath,
    handler,
    stop: () => {},
  };
}
