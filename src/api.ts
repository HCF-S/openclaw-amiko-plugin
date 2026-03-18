import type {
  AmikoOutboundPayload,
  AmikoOutboundResponse,
} from "./types.js";

export type AmikoApiOptions = {
  chatApiBaseUrl: string;
  token: string;
  timeoutMs?: number;
};

export class AmikoApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retriable: boolean,
  ) {
    super(message);
    this.name = "AmikoApiError";
  }
}

async function apiRequest<T>(
  method: "GET" | "POST",
  url: string,
  options: AmikoApiOptions,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const retriable = res.status === 429 || res.status >= 500;
      throw new AmikoApiError(`HTTP ${res.status}: ${text}`, res.status, retriable);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendAmikoOutbound(
  options: AmikoApiOptions,
  payload: AmikoOutboundPayload,
): Promise<AmikoOutboundResponse> {
  const url = `${options.chatApiBaseUrl}/api/internal/openclaw/amiko/messages`;
  console.log(`[amiko:api] sendAmikoOutbound POST ${url} conversationId=${payload.conversationId}`);
  const result = await apiRequest<AmikoOutboundResponse>("POST", url, options, payload);
  console.log(`[amiko:api] sendAmikoOutbound response:`, result);
  return result;
}
