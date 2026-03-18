import { createHmac, timingSafeEqual } from "node:crypto";
import type { ResolvedAmikoAccount, AmikoInboundEvent, AmikoWebhookPayload } from "./types.js";
import type { PluginRuntime, RegisterHttpRouteFn } from "./runtime.js";
import type { ProbeResult } from "./status.js";
import { sendTextAmiko } from "./send.js";
import { createReplyPrefixOptions } from "./reply-prefix.js";

export type MonitorOptions = {
  account: ResolvedAmikoAccount;
  config: unknown;
  runtime: PluginRuntime;
  abortSignal: AbortSignal;
  statusSink: (patch: Partial<ProbeResult> & { accountId: string }) => void;
  registerHttpRoute: RegisterHttpRouteFn;
};

export type MonitorHandle = {
  stop: () => void;
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
  const fromLabel = isGroup
    ? `group:${conversationId}`
    : (event.senderName || `user:${event.senderId}`);

  // ── replyExpected: false → inject context only, no agent response ──────────
  if (!replyExpected) {
    const injectMessage = `[${event.senderName || event.senderId}] ${rawBody}`;
    console.log(
      `[amiko:${account.accountId}] injecting context (no reply): ${injectMessage.slice(0, 100)}`,
    );

    try {
      await core.channel.chat.inject({
        sessionKey: route.sessionKey,
        message: injectMessage,
        label: event.senderName || event.senderId,
      });
    } catch (err) {
      console.error(`[amiko:${account.accountId}] chat.inject failed:`, err);
    }
    return;
  }

  // ── replyExpected: true → full agent dispatch ──────────────────────────────

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
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
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

// ── Event dispatcher ────────────────────────────────────────────────────────

async function processEvent(
  event: AmikoInboundEvent,
  options: Pick<MonitorOptions, "account" | "config" | "runtime">,
): Promise<void> {
  if (event.type === "post.published") {
    return processPostEvent(event, options);
  }

  if (event.type === "message.text" || event.type === "message.image") {
    return processChatEvent(event, options);
  }

  console.log(`[amiko:${options.account.accountId}] ignoring event type: ${event.type}`);
}

// ── Webhook monitor ─────────────────────────────────────────────────────────

export async function monitorAmikoProvider(options: MonitorOptions): Promise<MonitorHandle> {
  const { account, statusSink, registerHttpRoute } = options;
  const webhookPath =
    account.config.webhookPath ?? `/amiko/webhook/${account.twinId}`;
  const webhookSecret = account.config.webhookSecret;

  registerHttpRoute({
    path: webhookPath,
    auth: "gateway",
    match: "exact",
    replaceExisting: true,
    handler: async (req: any, res: any) => {
      // Read raw body from Node.js IncomingMessage stream
      const rawBody: Buffer = await new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });

      const sendJson = (statusCode: number, body: unknown) => {
        const json = JSON.stringify(body);
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Length", Buffer.byteLength(json));
        res.end(json);
      };

      // Verify HMAC signature when a secret is configured
      if (webhookSecret) {
        const sig = req.headers["x-amiko-signature"] as string | undefined;
        if (!sig) { sendJson(401, { error: "missing signature" }); return true; }
        if (!verifyHmacSignature(webhookSecret, rawBody, sig)) {
          sendJson(401, { error: "invalid signature" });
          return true;
        }
      }

      let payload: AmikoWebhookPayload;
      try {
        payload = JSON.parse(rawBody.toString("utf8")) as AmikoWebhookPayload;
      } catch {
        sendJson(400, { error: "invalid JSON" });
        return true;
      }

      const event = payload?.event;
      if (!event?.id || !event?.type) {
        sendJson(400, { error: "missing event" });
        return true;
      }

      // Respond 200 immediately (ack), then process asynchronously
      sendJson(200, { ok: true });

      try {
        await processEvent(event, options);
        statusSink({ accountId: account.accountId, status: "healthy" });
      } catch (err) {
        console.error(`[amiko:${account.accountId}] Error processing event ${event.id}:`, err);
        statusSink({ accountId: account.accountId, status: "unhealthy", message: String(err) });
      }

      return true;
    },
  });

  statusSink({ accountId: account.accountId, status: "healthy" });

  return {
    stop: () => {
      // Route will be replaced on next startAccount; nothing to tear down.
    },
  };
}
