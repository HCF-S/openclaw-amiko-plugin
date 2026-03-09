import type { AmikoConfig, AmikoAccountConfig, ResolvedAmikoAccount } from "./types.js";

export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_API_BASE_URL = "https://api.amiko.app";

export function normalizeAccountId(id: string): string {
  return id.toLowerCase().trim();
}

export function listAmikoAccountIds(cfg: { channels?: { amiko?: AmikoConfig } }): string[] {
  const amiko = cfg.channels?.amiko;
  if (!amiko) return [DEFAULT_ACCOUNT_ID];
  const accounts = amiko.accounts;
  if (!accounts || Object.keys(accounts).length === 0) return [DEFAULT_ACCOUNT_ID];
  return Object.keys(accounts).sort().map(normalizeAccountId);
}

export function resolveDefaultAmikoAccountId(cfg: { channels?: { amiko?: AmikoConfig } }): string {
  const amiko = cfg.channels?.amiko;
  if (!amiko) return DEFAULT_ACCOUNT_ID;
  if (amiko.defaultAccount) return normalizeAccountId(amiko.defaultAccount);
  const ids = listAmikoAccountIds(cfg);
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveAmikoAccountConfig(
  amiko: AmikoConfig,
  accountId: string,
): AmikoAccountConfig {
  if (accountId === DEFAULT_ACCOUNT_ID || !amiko.accounts) {
    return {
      name: amiko.name,
      enabled: amiko.enabled,
      token: amiko.token,
      apiBaseUrl: amiko.apiBaseUrl,
      dmPolicy: amiko.dmPolicy,
      allowFrom: amiko.allowFrom,
      groupPolicy: amiko.groupPolicy,
      groupAllowFrom: amiko.groupAllowFrom,
      pollIntervalMs: amiko.pollIntervalMs,
      pollTimeoutMs: amiko.pollTimeoutMs,
    };
  }
  const perAccount = amiko.accounts[accountId] ?? {};
  return {
    name: perAccount.name ?? amiko.name,
    enabled: perAccount.enabled ?? amiko.enabled,
    token: perAccount.token ?? amiko.token,
    apiBaseUrl: perAccount.apiBaseUrl ?? amiko.apiBaseUrl,
    dmPolicy: perAccount.dmPolicy ?? amiko.dmPolicy,
    allowFrom: perAccount.allowFrom ?? amiko.allowFrom,
    groupPolicy: perAccount.groupPolicy ?? amiko.groupPolicy,
    groupAllowFrom: perAccount.groupAllowFrom ?? amiko.groupAllowFrom,
    pollIntervalMs: perAccount.pollIntervalMs ?? amiko.pollIntervalMs,
    pollTimeoutMs: perAccount.pollTimeoutMs ?? amiko.pollTimeoutMs,
  };
}

export function resolveAmikoAccount(params: {
  cfg: { channels?: { amiko?: AmikoConfig } };
  accountId: string;
}): ResolvedAmikoAccount {
  const { cfg, accountId } = params;
  const amiko = cfg.channels?.amiko ?? ({} as AmikoConfig);
  const config = resolveAmikoAccountConfig(amiko, accountId);

  if (!config.token?.trim()) {
    throw new Error(`Amiko account "${accountId}" has no token configured`);
  }

  return {
    accountId,
    name: config.name,
    enabled: config.enabled !== false,
    token: config.token,
    apiBaseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    config,
  };
}

export function listEnabledAmikoAccounts(cfg: { channels?: { amiko?: AmikoConfig } }): string[] {
  return listAmikoAccountIds(cfg).filter((id) => {
    try {
      const account = resolveAmikoAccount({ cfg, accountId: id });
      return account.enabled;
    } catch {
      return false;
    }
  });
}
