import type { ResolvedAmikoAccount, AmikoInboundEvent } from "./types.js";
import type { PluginRuntime } from "./runtime.js";
import type { ProbeResult } from "./status.js";
import { fetchAmikoEvents, ackAmikoEvents, AmikoApiError } from "./api.js";
import { evaluateAmikoGroupAccess } from "./group-access.js";
import { sendTextAmiko } from "./send.js";

const POLL_INTERVAL_MS_DEFAULT = 3_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_JITTER_MS = 1_000;

export type MonitorOptions = {
  account: ResolvedAmikoAccount;
  config: unknown;
  runtime: PluginRuntime;
  abortSignal: AbortSignal;
  statusSink: (patch: Partial<ProbeResult> & { accountId: string }) => void;
};

export type MonitorHandle = {
  stop: () => void;
};

type CursorStore = {
  cursor: string | undefined;
};

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * BACKOFF_JITTER_MS);
}

function backoffMs(consecutiveErrors: number): number {
  const base = Math.min(1_000 * Math.pow(2, consecutiveErrors - 1), BACKOFF_MAX_MS);
  return jitter(base);
}

async function processEvent(
  event: AmikoInboundEvent,
  options: MonitorOptions,
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
  const { account, abortSignal, statusSink } = options;
  const pollIntervalMs = account.config.pollIntervalMs ?? POLL_INTERVAL_MS_DEFAULT;
  const apiOpts = {
    apiBaseUrl: account.apiBaseUrl,
    token: account.token,
    timeoutMs: account.config.pollTimeoutMs,
  };

  const store: CursorStore = { cursor: undefined };
  let stopped = false;
  let consecutiveErrors = 0;

  const poll = async (): Promise<void> => {
    if (stopped || abortSignal.aborted) return;

    try {
      const response = await fetchAmikoEvents(apiOpts, {
        accountId: account.accountId,
        cursor: store.cursor,
        limit: 50,
      });

      consecutiveErrors = 0;

      if (response.events.length > 0) {
        statusSink({ accountId: account.accountId, status: "healthy" });

        for (const event of response.events) {
          if (stopped || abortSignal.aborted) break;
          try {
            await processEvent(event, options);
          } catch (err) {
            // Per-event errors are logged but do not stop the loop
            console.error(`[amiko:${account.accountId}] Error processing event ${event.id}:`, err);
          }
        }

        // Acknowledge the batch
        const lastEvent = response.events[response.events.length - 1];
        if (lastEvent) {
          try {
            await ackAmikoEvents(apiOpts, {
              accountId: account.accountId,
              cursor: lastEvent.cursor,
              eventIds: response.events.map((e) => e.id),
            });
            store.cursor = response.nextCursor ?? lastEvent.cursor;
          } catch (err) {
            console.warn(`[amiko:${account.accountId}] Ack failed (non-fatal):`, err);
          }
        }

        // If there are more events, poll again immediately
        if (response.hasMore) {
          setImmediate(() => void poll());
          return;
        }
      }
    } catch (err) {
      consecutiveErrors++;

      if (err instanceof AmikoApiError && (err.statusCode === 401 || err.statusCode === 403)) {
        console.error(`[amiko:${account.accountId}] Auth failure (${err.statusCode}), stopping monitor`);
        statusSink({ accountId: account.accountId, status: "unhealthy", message: err.message });
        stopped = true;
        return;
      }

      statusSink({
        accountId: account.accountId,
        status: "unhealthy",
        message: String(err),
      });

      const delay = backoffMs(consecutiveErrors);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, delay);
        abortSignal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }

    if (!stopped && !abortSignal.aborted) {
      const waitMs = consecutiveErrors === 0 ? pollIntervalMs : 0;
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, waitMs);
          abortSignal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
        });
      }
      setImmediate(() => void poll());
    }
  };

  void poll();

  return {
    stop: () => {
      stopped = true;
    },
  };
}
