import { createHmac, timingSafeEqual } from "node:crypto";
import type { ResolvedAmikoAccount, AmikoInboundEvent, AmikoWebhookPayload } from "./types.js";
import type { PluginRuntime, RegisterHttpRouteFn } from "./runtime.js";
import type { ProbeResult } from "./status.js";
import { evaluateAmikoGroupAccess } from "./group-access.js";
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

async function processEvent(
  event: AmikoInboundEvent,
  options: Pick<MonitorOptions, "account" | "config" | "runtime">,
): Promise<void> {
  const { account, runtime: core, config } = options;

  console.log(`[amiko:${account.accountId}] processEvent: type=${event.type} convId=${event.conversationId} senderId=${event.senderId}`);

  const isGroup = event.conversationType === "group";
  const conversationId = event.conversationId;

  // Group access gate
  if (isGroup) {
    const groupAccess = evaluateAmikoGroupAccess({
      senderId: event.senderId,
      groupId: conversationId,
      policy: account.config.groupPolicy ?? "disabled",
      allowFrom: account.config.groupAllowFrom ?? [],
      requireMention: true,
      mentionFound: event.mentionsBot ?? false,
    });
    if (!groupAccess.allowed) return;
  } else {
    const dmPolicy = account.config.dmPolicy ?? "allowlist";
    if (dmPolicy === "disabled") return;
    if (dmPolicy === "allowlist") {
      const allowFrom = account.config.allowFrom ?? [];
      if (!allowFrom.some((id) => id.trim() === event.senderId.trim())) return;
    }
  }

  if (event.type !== "message.text" && event.type !== "message.image") return;

  const peer = { kind: event.conversationType as "direct" | "group", id: conversationId };

  // Resolve agent route (determines sessionKey + agentId, same as Zalo/Telegram plugins)
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
  const fromLabel = isGroup ? `group:${conversationId}` : (event.senderName || `user:${event.senderId}`);
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

  console.log(`[amiko:${account.accountId}] dispatching reply: sessionKey=${route.sessionKey} agentId=${route.agentId}`);

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload: { text?: string; mediaUrl?: string }) => {
        console.log(`[amiko:${account.accountId}] deliver called: text=${!!payload.text} mediaUrl=${!!payload.mediaUrl}`);
        if (payload.text) {
          console.log(`[amiko:${account.accountId}] delivering reply to ${conversationId}: ${payload.text.slice(0, 100)}`);
          const result = await sendTextAmiko(conversationId, payload.text, account);
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

export async function monitorAmikoProvider(options: MonitorOptions): Promise<MonitorHandle> {
  const { account, statusSink, registerHttpRoute } = options;
  const webhookPath =
    account.config.webhookPath ?? `/amiko/webhook/${account.accountId}`;
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
