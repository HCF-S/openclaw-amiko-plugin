/**
 * Amiko Platform API Library
 * Reads config from ~/.openclaw/openclaw.json -> channels.amiko
 * Uses the twin token already configured for the OpenClaw plugin.
 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_PLATFORM_API_BASE_URL = "https://platform.heyamiko.com";
const DEFAULT_CHAT_API_BASE_URL = "https://api.amiko.app";

let _accountId = "";

export function setAccountId(accountId) {
  _accountId = (accountId || "").trim();
}

export function resolveConfigPath() {
  if (process.env.OPENCLAW_CONFIG_PATH) return process.env.OPENCLAW_CONFIG_PATH;
  const stateDir =
    process.env.OPENCLAW_STATE_DIR ||
    path.join(process.env.HOME || "/data", ".openclaw");
  return path.join(stateDir, "openclaw.json");
}

function stripJsonComments(text) {
  return text
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1");
}

function normalizeApiBaseUrl(value, fallback = DEFAULT_PLATFORM_API_BASE_URL) {
  const raw = String(value || "").trim() || fallback;
  return raw.replace(/\/+$/, "").replace(/\/api$/, "");
}

function detectAgentIdFromCwd() {
  const cwd = process.cwd();
  const match = cwd.match(/(?:^|[\\/])workspace(?:-([^\\/]+))?(?:[\\/]|$)/);
  if (!match) return "";
  return match[1] ? match[1].trim().toLowerCase() : "main";
}

export function detectCurrentAccountId() {
  const fromEnv = String(process.env.OPENCLAW_AGENT_ID || "").trim().toLowerCase();
  if (fromEnv) return fromEnv;
  return detectAgentIdFromCwd();
}

function loadOpenClawConfig() {
  const configPath = resolveConfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error(`OpenClaw config not found: ${configPath}`);
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(stripJsonComments(raw));
  } catch (error) {
    throw new Error(`Failed to parse OpenClaw config: ${error.message}`);
  }
}

export function listConfiguredAccounts() {
  const raw = loadOpenClawConfig();
  const amiko = raw?.channels?.amiko;

  if (!amiko) return [];
  if (amiko.accounts && Object.keys(amiko.accounts).length > 0) {
    return Object.keys(amiko.accounts)
      .map((accountId) => accountId.trim().toLowerCase())
      .sort();
  }

  const singleId =
    amiko.agentId ||
    amiko.twinId ||
    amiko.accountId ||
    amiko.id ||
    _accountId;

  return singleId ? [singleId] : [];
}

function resolveSingleAccountConfig(amiko, requestedAccountId) {
  return {
    accountId:
      requestedAccountId ||
      amiko.agentId ||
      amiko.twinId ||
      amiko.accountId ||
      amiko.id ||
      "",
    twinId: amiko.twinId || amiko.accountId || amiko.id || "",
    token: amiko.token || "",
    platformApiBaseUrl: normalizeApiBaseUrl(
      amiko.platformApiBaseUrl || amiko.apiBaseUrl,
      DEFAULT_PLATFORM_API_BASE_URL,
    ),
    chatApiBaseUrl: normalizeApiBaseUrl(
      amiko.chatApiBaseUrl || amiko.apiBaseUrl || amiko.platformApiBaseUrl,
      DEFAULT_CHAT_API_BASE_URL,
    ),
  };
}

function resolveMultiAccountConfig(amiko, requestedAccountId) {
  const accountMap = Object.fromEntries(
    Object.entries(amiko.accounts || {}).map(([accountId, config]) => [
      accountId.trim().toLowerCase(),
      config,
    ]),
  );
  const accountIds = Object.keys(accountMap);
  if (accountIds.length === 0) {
    throw new Error("No channels.amiko.accounts configured");
  }

  const requested = String(
    requestedAccountId || detectCurrentAccountId() || amiko.defaultAccount || "",
  )
    .trim()
    .toLowerCase();
  const fallbackAccountId = accountIds.includes("main") ? "main" : accountIds[0];
  const normalizedResolvedAccountId = accountIds.includes(requested)
    ? requested
    : fallbackAccountId;
  const accountConfig = accountMap[normalizedResolvedAccountId];

  if (!accountConfig) {
    throw new Error(
      `Amiko account "${normalizedResolvedAccountId}" not found. Available accounts: ${accountIds.join(", ")}`,
    );
  }

  return {
    accountId: normalizedResolvedAccountId,
    twinId: accountConfig.twinId || amiko.twinId || "",
    token: accountConfig.token || amiko.token || "",
    platformApiBaseUrl: normalizeApiBaseUrl(
      accountConfig.platformApiBaseUrl ||
        accountConfig.apiBaseUrl ||
        amiko.platformApiBaseUrl ||
        amiko.apiBaseUrl,
      DEFAULT_PLATFORM_API_BASE_URL,
    ),
    chatApiBaseUrl: normalizeApiBaseUrl(
      accountConfig.chatApiBaseUrl ||
        accountConfig.apiBaseUrl ||
        amiko.chatApiBaseUrl ||
        amiko.apiBaseUrl ||
        amiko.platformApiBaseUrl,
      DEFAULT_CHAT_API_BASE_URL,
    ),
  };
}

function loadConfig(accountId) {
  const raw = loadOpenClawConfig();
  const amiko = raw?.channels?.amiko;

  if (!amiko) {
    throw new Error("No channels.amiko section found in openclaw.json");
  }

  if (amiko.accounts) {
    return resolveMultiAccountConfig(amiko, accountId);
  }

  return resolveSingleAccountConfig(amiko, accountId);
}

export function getConfig() {
  const config = loadConfig(_accountId || detectCurrentAccountId() || undefined);

  if (!config.twinId) {
    throw new Error(
      "No twinId configured. Use channels.amiko.accounts.<agentId>.twinId in openclaw.json.",
    );
  }

  if (!config.token) {
    throw new Error(
      "No token configured for channels.amiko. Add a twin token in openclaw.json.",
    );
  }

  return {
    twinId: config.twinId,
    accountId: config.accountId,
    token: config.token,
    platformApiBaseUrl: config.platformApiBaseUrl,
    chatApiBaseUrl: config.chatApiBaseUrl,
  };
}

function ensureLeadingSlash(value) {
  return value.startsWith("/") ? value : `/${value}`;
}

async function readResponseError(response) {
  const text = await response.text().catch(() => "");
  return text || response.statusText || "Unknown error";
}

async function expectJson(response, label) {
  if (!response.ok) {
    throw new Error(
      `${label} failed: ${response.status} - ${await readResponseError(response)}`,
    );
  }
  return response.json();
}

async function requestJson(endpoint, options, label) {
  const response = await apiRequest(endpoint, options);
  return expectJson(response, label);
}

function createJsonRequest(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getMimeType(ext) {
  const types = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".json": "application/json",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
  };
  const normalized = ext.startsWith(".") ? ext : `.${ext}`;
  return types[normalized.toLowerCase()] || "application/octet-stream";
}

function createBlobFromFileInput(file, options = {}) {
  if (typeof file === "string") {
    const buffer = fs.readFileSync(file);
    const filename = options.filename || path.basename(file);
    return {
      blob: new Blob([buffer], {
        type: options.contentType || getMimeType(path.extname(filename)),
      }),
      filename,
    };
  }

  if (Buffer.isBuffer(file)) {
    if (!options.filename) {
      throw new Error("filename is required when file is a Buffer");
    }
    return {
      blob: new Blob([file], {
        type: options.contentType || getMimeType(path.extname(options.filename)),
      }),
      filename: options.filename,
    };
  }

  throw new Error("File must be a file path or Buffer");
}

export async function apiRequest(endpoint, options = {}) {
  const config = getConfig();
  const url = `${config.platformApiBaseUrl}${ensureLeadingSlash(endpoint)}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${config.token}`);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export async function getTwinInfo() {
  return requestJson(`/api/agents/${getConfig().twinId}`, {}, "Get twin info");
}

export async function updateTwin(data) {
  return requestJson(
    `/api/agents/${getConfig().twinId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    "Update twin",
  );
}

export async function listDocs(options = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  if (options.search) params.set("search", options.search);

  return requestJson(
    `/api/agents/${getConfig().twinId}/docs?${params.toString()}`,
    {},
    "List docs",
  );
}

export async function getDoc(docId) {
  if (!docId) throw new Error("docId is required");
  return requestJson(
    `/api/agents/${getConfig().twinId}/docs/${docId}`,
    {},
    "Get doc",
  );
}

export async function createDoc(docData) {
  return requestJson(
    `/api/agents/${getConfig().twinId}/docs`,
    createJsonRequest(docData),
    "Create doc",
  );
}

export async function createDocUploadUrl(filename, contentType) {
  if (!filename) throw new Error("filename is required");
  return requestJson(
    `/api/agents/${getConfig().twinId}/docs/presigned-url`,
    createJsonRequest({ filename, contentType }),
    "Create doc upload URL",
  );
}

export async function uploadDocFile(file, options = {}) {
  const { blob, filename } = createBlobFromFileInput(file, options);
  const formData = new FormData();
  formData.append("file", blob, filename);

  return requestJson(
    `/api/agents/${getConfig().twinId}/docs/upload`,
    { method: "POST", body: formData },
    "Upload doc file",
  );
}

export async function uploadDoc(file, options = {}) {
  const uploadResult = await uploadDocFile(file, options);
  const filename = options.filename || uploadResult.filename;
  const title = options.title || filename;

  return createDoc({
    filename,
    fileType: options.contentType || uploadResult.fileType,
    fileUrl: uploadResult.url,
    title,
    description: options.description,
    doc_type: options.docType || "other",
    relationship: options.relationship ?? null,
    stance: options.stance ?? null,
  });
}

export async function uploadDocFromFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return uploadDoc(filePath, {
    ...options,
    filename: options.filename || path.basename(filePath),
  });
}

export async function checkDocsProcessing(docIds) {
  if (!Array.isArray(docIds) || docIds.length === 0) {
    throw new Error("docIds must be a non-empty array");
  }

  return requestJson(
    `/api/agents/${getConfig().twinId}/docs/check-processing`,
    createJsonRequest({ docIds }),
    "Check doc processing",
  );
}

export async function deleteDoc(docId) {
  if (!docId) throw new Error("docId is required");
  return requestJson(
    `/api/agents/${getConfig().twinId}/docs/${docId}`,
    { method: "DELETE" },
    "Delete doc",
  );
}

export async function getVoice() {
  return requestJson(
    `/api/agents/${getConfig().twinId}/voice`,
    {},
    "Get voice",
  );
}

export async function updateVoice(data) {
  return requestJson(
    `/api/agents/${getConfig().twinId}/voice`,
    createJsonRequest(data),
    "Update voice",
  );
}

export async function designVoice(voiceDescription) {
  if (!voiceDescription || voiceDescription.trim().length < 20) {
    throw new Error("voiceDescription must be at least 20 characters");
  }

  return requestJson(
    `/api/agents/${getConfig().twinId}/voice/design`,
    createJsonRequest({ voiceDescription: voiceDescription.trim() }),
    "Design voice",
  );
}

export async function createVoice(data) {
  if (!data?.generatedVoiceId) {
    throw new Error("generatedVoiceId is required");
  }

  return requestJson(
    `/api/agents/${getConfig().twinId}/voice/create`,
    createJsonRequest(data),
    "Create voice",
  );
}

export async function cloneVoice(file, options = {}) {
  const { blob, filename } = createBlobFromFileInput(file, options);
  const formData = new FormData();
  formData.append("audio", blob, filename);

  return requestJson(
    `/api/agents/${getConfig().twinId}/voice/clone`,
    { method: "POST", body: formData },
    "Clone voice",
  );
}

export async function cloneVoiceFromFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return cloneVoice(filePath, {
    ...options,
    filename: options.filename || path.basename(filePath),
  });
}

export async function resetVoice() {
  return requestJson(
    `/api/agents/${getConfig().twinId}/voice/reset`,
    { method: "POST" },
    "Reset voice",
  );
}

export async function updateAvatar(file, options = {}) {
  const { blob, filename } = createBlobFromFileInput(file, options);
  const formData = new FormData();
  formData.append("image", blob, filename);

  return requestJson(
    `/api/agents/${getConfig().twinId}/avatar`,
    { method: "POST", body: formData },
    "Update avatar",
  );
}

export async function searchFriends(query) {
  if (!query || !query.trim()) {
    throw new Error("query is required");
  }

  const params = new URLSearchParams({ q: query.trim() });
  return requestJson(`/api/friends/search?${params.toString()}`, {}, "Search friends");
}

export async function listFriends(options = {}) {
  const params = new URLSearchParams();
  if (options.type) params.set("type", options.type);
  if (options.favoritesOnly) params.set("favorites_only", "true");
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson(`/api/friends${suffix}`, {}, "List friends");
}

export async function listFriendRequests() {
  return requestJson("/api/friends/requests", {}, "List friend requests");
}

export async function sendFriendRequest(friendId) {
  if (!friendId) throw new Error("friendId is required");
  return requestJson(
    "/api/friends",
    createJsonRequest({ friend_id: friendId }),
    "Send friend request",
  );
}

export async function acceptFriendRequest(friendshipId) {
  if (!friendshipId) throw new Error("friendshipId is required");
  return requestJson(
    `/api/friends/${friendshipId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    },
    "Accept friend request",
  );
}

export async function declineFriendRequest(friendshipId) {
  if (!friendshipId) throw new Error("friendshipId is required");
  return requestJson(
    `/api/friends/${friendshipId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline" }),
    },
    "Decline friend request",
  );
}

export async function removeFriendship(friendshipId) {
  if (!friendshipId) throw new Error("friendshipId is required");
  return requestJson(
    `/api/friends/${friendshipId}`,
    { method: "DELETE" },
    "Remove friendship",
  );
}

export async function getFeed(options = {}) {
  const params = new URLSearchParams({
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 20),
  });

  return requestJson(`/api/feed?${params.toString()}`, {}, "Get feed");
}

export async function getPost(postId) {
  if (!postId) throw new Error("postId is required");
  return requestJson(`/api/posts/${postId}`, {}, "Get post");
}

export async function commentOnPost(postId, comment, options = {}) {
  if (!postId) throw new Error("postId is required");
  if (!comment || !comment.trim()) {
    throw new Error("comment is required");
  }

  return requestJson(
    `/api/posts/${postId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: comment.trim(),
        media_urls: Array.isArray(options.mediaUrls) ? options.mediaUrls : [],
        ...(options.twinId ? { twin_id: options.twinId } : {}),
      }),
    },
    "Comment on post",
  );
}

export async function connectComposioApp(appName, redirectUrl) {
  if (!appName) throw new Error("appName is required");
  return requestJson(
    `/api/agents/${getConfig().twinId}/composio/connect`,
    createJsonRequest({ appName, redirectUrl }),
    "Connect Composio app",
  );
}

export async function listComposioConnections() {
  return requestJson(
    `/api/agents/${getConfig().twinId}/composio/connections`,
    {},
    "List Composio connections",
  );
}

export async function disconnectComposioConnection(connectionId) {
  if (!connectionId) throw new Error("connectionId is required");
  return requestJson(
    `/api/agents/${getConfig().twinId}/composio/connections`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    },
    "Disconnect Composio connection",
  );
}
