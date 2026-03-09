import { randomUUID } from "node:crypto";
import type { ResolvedAmikoAccount, AmikoSendResult } from "./types.js";
import { sendAmikoOutbound, AmikoApiError } from "./api.js";

export async function sendTextAmiko(
  conversationId: string,
  text: string,
  account: ResolvedAmikoAccount,
): Promise<AmikoSendResult> {
  const idempotencyKey = `${account.accountId}:${conversationId}:${randomUUID()}`;
  try {
    const res = await sendAmikoOutbound(
      { apiBaseUrl: account.apiBaseUrl, token: account.token, timeoutMs: account.config.pollTimeoutMs },
      { accountId: account.accountId, conversationId, idempotencyKey, type: "text", text },
    );
    if (!res.ok) {
      return { ok: false, retriable: res.retriable ?? false, error: res.error ?? "Unknown error" };
    }
    return { ok: true, messageId: res.messageId };
  } catch (err) {
    if (err instanceof AmikoApiError) {
      return { ok: false, retriable: err.retriable, error: err.message };
    }
    return { ok: false, retriable: false, error: String(err) };
  }
}

export async function sendMediaAmiko(
  conversationId: string,
  text: string,
  mediaUrl: string,
  mediaCaption: string | undefined,
  account: ResolvedAmikoAccount,
): Promise<AmikoSendResult> {
  const idempotencyKey = `${account.accountId}:${conversationId}:${randomUUID()}`;
  try {
    const res = await sendAmikoOutbound(
      { apiBaseUrl: account.apiBaseUrl, token: account.token, timeoutMs: account.config.pollTimeoutMs },
      { accountId: account.accountId, conversationId, idempotencyKey, type: "media", text, mediaUrl, mediaCaption },
    );
    if (!res.ok) {
      return { ok: false, retriable: res.retriable ?? false, error: res.error ?? "Unknown error" };
    }
    return { ok: true, messageId: res.messageId };
  } catch (err) {
    if (err instanceof AmikoApiError) {
      return { ok: false, retriable: err.retriable, error: err.message };
    }
    return { ok: false, retriable: false, error: String(err) };
  }
}
