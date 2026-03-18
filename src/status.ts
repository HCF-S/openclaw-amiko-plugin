import type { ResolvedAmikoAccount } from "./types.js";
import { AmikoApiError } from "./api.js";

export type ProbeResult = {
  status: "healthy" | "unhealthy" | "unconfigured";
  message?: string;
  latencyMs?: number;
};

export type AccountSnapshot = {
  accountId: string;
  twinId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  platformApiBaseUrl: string;
  chatApiBaseUrl: string;
};

export async function probeAmikoAccount(account: ResolvedAmikoAccount): Promise<ProbeResult> {
  if (!account.token?.trim()) {
    return { status: "unconfigured", message: "No token configured" };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${account.chatApiBaseUrl}/internal/openclaw/amiko/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${account.token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const retriable = res.status === 429 || res.status >= 500;
      throw new AmikoApiError(`HTTP ${res.status}: ${text}`, res.status, retriable);
    }

    return { status: "healthy", latencyMs: Date.now() - start };
  } catch (err) {
    return { status: "unhealthy", message: String(err), latencyMs: Date.now() - start };
  }
}

export function buildAmikoAccountSnapshot(account: ResolvedAmikoAccount): AccountSnapshot {
  return {
    accountId: account.accountId,
    twinId: account.twinId,
    name: account.name,
    enabled: account.enabled,
    configured: Boolean(account.token?.trim()),
    platformApiBaseUrl: account.platformApiBaseUrl,
    chatApiBaseUrl: account.chatApiBaseUrl,
  };
}

export function inspectAmikoAccount(account: ResolvedAmikoAccount): Record<string, unknown> {
  return {
    accountId: account.accountId,
    twinId: account.twinId,
    name: account.name,
    enabled: account.enabled,
    hasToken: Boolean(account.token?.trim()),
    platformApiBaseUrl: account.platformApiBaseUrl,
    chatApiBaseUrl: account.chatApiBaseUrl,
    webhookPath: account.config.webhookPath ?? `/amiko/webhook/${account.twinId}`,
    webhookSecret: account.config.webhookSecret ? "(configured)" : "(not set)",
  };
}
