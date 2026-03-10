import { createHmac, timingSafeEqual } from "node:crypto";
import type { ResolvedAmikoAccount, AmikoInboundEvent, AmikoWebhookPayload } from "./types.js";
import type { PluginRuntime, RegisterHttpRouteFn } from "./runtime.js";
import type { ProbeResult } from "./status.js";
import { evaluateAmikoGroupAccess } from "./group-access.js";
import { sendTextAmiko } from "./send.js";

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
  const { account, runtime, config } = options;
  const core = runtime.core;

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

    if (!groupAccess.allowed) {
      // Silent drop — not an error
      return;
    }
  } else {
    // DM authorization gate
    const dmPolicy = account.config.dmPolicy ?? "allowlist";
    if (dmPolicy === "disabled") return;

    if (dmPolicy === "allowlist") {
      const allowFrom = account.config.allowFrom ?? [];
      const allowed = allowFrom.some((id) => id.trim() === event.senderId.trim());
      if (!allowed) return;
    }
    // dmPolicy === "open" → allow all
  }

  // Only process text and image events with content
  if (event.type === "participant.added") return;
  if (event.type !== "message.text" && event.type !== "message.image") return;

  const peer = { kind: event.conversationType as "direct" | "group", id: conversationId };
  const sessionKey = `amiko:${account.accountId}:${peer.kind}:${conversationId}`;

  // Build context and dispatch reply
  const ctxPayload = core.channel.reply.finalizeInboundContext({
    channel: "amiko",
    accountId: account.accountId,
    sessionKey,
    peer,
    cfg: config,
    from: event.senderName,
    timestamp: event.timestamp,
    body: event.text ?? "",
    attachments: event.mediaUrl
      ? [{ type: "image", url: event.mediaUrl, caption: event.mediaCaption }]
      : [],
  });

  await core.channel.session.recordInboundSession({
    storePath: `amiko/${account.accountId}/${peer.kind}/${conversationId}`,
    sessionKey,
    ctx: ctxPayload,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      deliver: async (payload: { type: string; text?: string; mediaUrl?: string; caption?: string }) => {
        if (payload.type === "text" && payload.text) {
          await sendTextAmiko(conversationId, payload.text, account);
        }
      },
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
    handler: async (req, res) => {
      // Verify HMAC signature when a secret is configured
      if (webhookSecret) {
        const sig = req.headers["x-amiko-signature"] as string | undefined;
        if (!sig) {
          res.status(401).json({ error: "missing signature" });
          return true;
        }
        const rawBody: Buffer | string = req.body ?? "";
        if (!verifyHmacSignature(webhookSecret, rawBody, sig)) {
          res.status(401).json({ error: "invalid signature" });
          return true;
        }
      }

      let payload: AmikoWebhookPayload;
      try {
        payload = req.json() as AmikoWebhookPayload;
      } catch {
        res.status(400).json({ error: "invalid JSON" });
        return true;
      }

      const event = payload?.event;
      if (!event?.id || !event?.type) {
        res.status(400).json({ error: "missing event" });
        return true;
      }

      // Respond 200 immediately (ack), then process asynchronously
      res.status(200).json({ ok: true });

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
