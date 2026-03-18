import type { AmikoConfig, AmikoAccountConfig, ResolvedAmikoAccount } from "./types.js";

export const DEFAULT_ACCOUNT_ID = "main";
export const DEFAULT_PLATFORM_API_BASE_URL = "https://platform.heyamiko.com";
export const DEFAULT_CHAT_API_BASE_URL = "https://api.amiko.app";

export function normalizeAccountId(id: string): string {
  return id.toLowerCase().trim();
}

function normalizeBaseUrl(url: string | undefined, fallback: string): string {
  const value = String(url || "").trim();
  if (!value) return fallback;
  return value.replace(/\/+$/, "").replace(/\/api$/, "");
}

function getAccountEntries(amiko?: AmikoConfig): [string, AmikoAccountConfig][] {
  if (!amiko?.accounts || Object.keys(amiko.accounts).length === 0) {
    return [];
  }

  return Object.entries(amiko.accounts).map(([accountId, config]) => [
    normalizeAccountId(accountId),
    config,
  ]);
}

export function listAmikoAccountIds(cfg: { channels?: { amiko?: AmikoConfig } }): string[] {
  const amiko = cfg.channels?.amiko;
  const accounts = getAccountEntries(amiko);
  if (accounts.length === 0) return [DEFAULT_ACCOUNT_ID];
  return accounts.map(([accountId]) => accountId).sort();
}

export function resolveDefaultAmikoAccountId(cfg: { channels?: { amiko?: AmikoConfig } }): string {
  const amiko = cfg.channels?.amiko;
  if (!amiko) return DEFAULT_ACCOUNT_ID;
  if (amiko.defaultAccount) return normalizeAccountId(amiko.defaultAccount);

  const accounts = getAccountEntries(amiko);
  if (accounts.length === 0) return DEFAULT_ACCOUNT_ID;

  const hasMain = accounts.some(([accountId]) => accountId === DEFAULT_ACCOUNT_ID);
  if (hasMain) return DEFAULT_ACCOUNT_ID;

  return accounts
    .map(([accountId]) => accountId)
    .sort()[0] ?? DEFAULT_ACCOUNT_ID;
}

export function resolveAmikoAccountConfig(
  amiko: AmikoConfig,
  accountId: string,
): AmikoAccountConfig {
  const normalizedAccountId = normalizeAccountId(accountId);

  if (!amiko.accounts || Object.keys(amiko.accounts).length === 0) {
    return {
      name: amiko.name,
      enabled: amiko.enabled,
      twinId: amiko.twinId,
      token: amiko.token,
      platformApiBaseUrl: amiko.platformApiBaseUrl ?? amiko.apiBaseUrl,
      chatApiBaseUrl: amiko.chatApiBaseUrl ?? amiko.apiBaseUrl,
      apiBaseUrl: amiko.apiBaseUrl,
      webhookPath: amiko.webhookPath,
      webhookSecret: amiko.webhookSecret,
    };
  }

  const accountMap = Object.fromEntries(getAccountEntries(amiko));
  const perAccount = accountMap[normalizedAccountId] ?? {};

  return {
    name: perAccount.name ?? amiko.name,
    enabled: perAccount.enabled ?? amiko.enabled,
    twinId: perAccount.twinId ?? amiko.twinId,
    token: perAccount.token ?? amiko.token,
    platformApiBaseUrl:
      perAccount.platformApiBaseUrl ??
      perAccount.apiBaseUrl ??
      amiko.platformApiBaseUrl ??
      amiko.apiBaseUrl,
    chatApiBaseUrl:
      perAccount.chatApiBaseUrl ??
      perAccount.apiBaseUrl ??
      amiko.chatApiBaseUrl ??
      amiko.apiBaseUrl,
    apiBaseUrl: perAccount.apiBaseUrl ?? amiko.apiBaseUrl,
    webhookPath: perAccount.webhookPath ?? amiko.webhookPath,
    webhookSecret: perAccount.webhookSecret ?? amiko.webhookSecret,
  };
}

export function resolveAmikoAccount(params: {
  cfg: { channels?: { amiko?: AmikoConfig } };
  accountId: string;
}): ResolvedAmikoAccount {
  const { cfg, accountId } = params;
  const normalizedAccountId = normalizeAccountId(accountId);
  const amiko = cfg.channels?.amiko ?? ({} as AmikoConfig);
  const config = resolveAmikoAccountConfig(amiko, normalizedAccountId);

  if (!config.twinId?.trim()) {
    throw new Error(`Amiko account "${normalizedAccountId}" has no twinId configured`);
  }

  if (!config.token?.trim()) {
    throw new Error(`Amiko account "${normalizedAccountId}" has no token configured`);
  }

  const platformApiBaseUrl = normalizeBaseUrl(
    config.platformApiBaseUrl ?? config.apiBaseUrl,
    DEFAULT_PLATFORM_API_BASE_URL,
  );
  const chatApiBaseUrl = normalizeBaseUrl(
    config.chatApiBaseUrl ?? config.apiBaseUrl,
    DEFAULT_CHAT_API_BASE_URL,
  );

  return {
    accountId: normalizedAccountId,
    twinId: config.twinId,
    name: config.name,
    enabled: config.enabled !== false,
    token: config.token,
    platformApiBaseUrl,
    chatApiBaseUrl,
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
