/**
 * Amiko Platform API Library
 * Reads config from ~/.openclaw/openclaw.json → channels.amiko
 * No .amiko.json needed — twin token comes from the plugin config.
 */

import fs from "node:fs";
import path from "node:path";

// ── Config loading ──────────────────────────────────────────────────────────

const DEFAULT_API_BASE_URL = "https://api.amiko.app";

/**
 * Resolve the openclaw.json config path.
 * Checks OPENCLAW_CONFIG_PATH, OPENCLAW_STATE_DIR, then defaults.
 */
function resolveConfigPath() {
  if (process.env.OPENCLAW_CONFIG_PATH) return process.env.OPENCLAW_CONFIG_PATH;
  const stateDir =
    process.env.OPENCLAW_STATE_DIR ||
    path.join(process.env.HOME || "/data", ".openclaw");
  return path.join(stateDir, "openclaw.json");
}

/**
 * Load amiko channel config from openclaw.json.
 * Returns the first enabled account (or the one matching accountId).
 */
function loadConfig(accountId) {
  const configPath = resolveConfigPath();

  if (!fs.existsSync(configPath)) {
    throw new Error(`OpenClaw config not found: ${configPath}`);
  }

  let raw;
  try {
    // JSON5-compatible: strip comments and trailing commas
    const text = fs.readFileSync(configPath, "utf8");
    const cleaned = text
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1");
    raw = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse OpenClaw config: ${err.message}`);
  }

  const amiko = raw?.channels?.amiko;
  if (!amiko) {
    throw new Error("No channels.amiko section in openclaw.json");
  }

  // Multi-account mode
  if (amiko.accounts) {
    if (accountId && amiko.accounts[accountId]) {
      const acct = amiko.accounts[accountId];
      return {
        twinId: accountId,
        token: acct.token || amiko.token || "",
        apiBaseUrl: acct.apiBaseUrl || amiko.apiBaseUrl || DEFAULT_API_BASE_URL,
      };
    }

    // Use defaultAccount or first account
    const defaultId = amiko.defaultAccount || Object.keys(amiko.accounts)[0];
    const acct = amiko.accounts[defaultId];
    if (!acct) throw new Error("No amiko accounts configured");
    return {
      twinId: defaultId,
      token: acct.token || amiko.token || "",
      apiBaseUrl: acct.apiBaseUrl || amiko.apiBaseUrl || DEFAULT_API_BASE_URL,
    };
  }

  // Single-account mode
  return {
    twinId: amiko.accountId || "",
    token: amiko.token || "",
    apiBaseUrl: amiko.apiBaseUrl || DEFAULT_API_BASE_URL,
  };
}

let _accountId = "";

/**
 * Set which twin account to use. Call before other functions.
 * @param {string} accountId - Twin ID (matches accountId in channels.amiko.accounts)
 */
export function setAccountId(accountId) {
  _accountId = accountId || "";
}

/**
 * Get validated config. Throws if token is missing.
 */
export function getConfig() {
  const config = loadConfig(_accountId || undefined);
  if (!config.token) {
    throw new Error(
      "No token configured for amiko channel (check channels.amiko in openclaw.json)",
    );
  }
  return config;
}

// ── API client ──────────────────────────────────────────────────────────────

/**
 * Make an authenticated API request to Amiko Platform.
 */
export async function apiRequest(endpoint, options = {}) {
  const config = getConfig();
  const url = `${config.apiBaseUrl}${endpoint}`;

  const headers = {
    Authorization: `Bearer ${config.token}`,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

// ── Twin info ───────────────────────────────────────────────────────────────

/** Get twin information */
export async function getTwinInfo() {
  const config = getConfig();
  const response = await apiRequest(`/api/agents/${config.twinId}`);
  if (!response.ok) {
    throw new Error(
      `Failed to get twin info: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Documents ───────────────────────────────────────────────────────────────

/** List documents for the twin */
export async function listDocs(options = {}) {
  const config = getConfig();
  const { limit = 50, offset = 0 } = options;
  const response = await apiRequest(
    `/api/agents/${config.twinId}/docs?limit=${limit}&offset=${offset}`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to list docs: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Create a new document (text content) */
export async function createDoc(docData) {
  const config = getConfig();
  const response = await apiRequest(`/api/agents/${config.twinId}/docs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(docData),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create doc: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Upload a document file */
export async function uploadDoc(file, options = {}) {
  const config = getConfig();
  const formData = new FormData();

  if (typeof file === "string") {
    const fileBuffer = fs.readFileSync(file);
    const filename = options.filename || path.basename(file);
    const ext = path.extname(filename).toLowerCase();
    const contentType = options.contentType || getMimeType(ext);
    const blob = new Blob([fileBuffer], { type: contentType });
    formData.append("file", blob, filename);
  } else if (Buffer.isBuffer(file)) {
    if (!options.filename) throw new Error("filename required for Buffer");
    const ext = path.extname(options.filename).toLowerCase();
    const contentType = options.contentType || getMimeType(ext);
    const blob = new Blob([file], { type: contentType });
    formData.append("file", blob, options.filename);
  } else {
    throw new Error("File must be a file path or Buffer");
  }

  const response = await apiRequest(
    `/api/agents/${config.twinId}/docs/upload`,
    { method: "POST", body: formData },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to upload doc: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Voice ───────────────────────────────────────────────────────────────────

/** Get twin voice configuration */
export async function getVoice() {
  const config = getConfig();
  const response = await apiRequest(`/api/agents/${config.twinId}/voice`);
  if (!response.ok) {
    throw new Error(
      `Failed to get voice: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Design a voice from text description */
export async function designVoice(description) {
  const config = getConfig();
  if (!description || description.trim().length < 20) {
    throw new Error("Voice description must be at least 20 characters");
  }
  const response = await apiRequest(
    `/api/agents/${config.twinId}/voice/design`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceDescription: description }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to design voice: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Clone voice from an audio file */
export async function cloneVoice(audio, options = {}) {
  const config = getConfig();
  const formData = new FormData();

  if (typeof audio === "string") {
    const buf = fs.readFileSync(audio);
    const blob = new Blob([buf], { type: "audio/mpeg" });
    formData.append("audio", blob, path.basename(audio));
  } else if (Buffer.isBuffer(audio)) {
    const blob = new Blob([audio], { type: "audio/mpeg" });
    formData.append("audio", blob, "audio.mp3");
  } else {
    throw new Error("Audio must be a file path or Buffer");
  }

  if (options.voiceName) formData.append("voice_name", options.voiceName);
  if (options.description) formData.append("description", options.description);

  const response = await apiRequest(
    `/api/agents/${config.twinId}/voice/clone`,
    { method: "POST", body: formData },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to clone voice: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Avatar ──────────────────────────────────────────────────────────────────

/** Update twin avatar */
export async function updateAvatar(file) {
  const config = getConfig();
  const formData = new FormData();

  if (typeof file === "string") {
    const buf = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    const blob = new Blob([buf], { type: getMimeType(ext) });
    formData.append("avatar", blob, path.basename(file));
  } else {
    throw new Error("Avatar must be a file path");
  }

  const response = await apiRequest(
    `/api/agents/${config.twinId}/avatar`,
    { method: "POST", body: formData },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to update avatar: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Friends ─────────────────────────────────────────────────────────────────

/** Search for users to add as friends */
export async function searchFriends(query, options = {}) {
  const { type = "user" } = options;
  if (!query?.trim()) throw new Error("Search query is required");

  const params = new URLSearchParams({ q: query, type });
  const response = await apiRequest(`/api/friends/search?${params}`);
  if (!response.ok) {
    throw new Error(
      `Failed to search: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** List current user's friends */
export async function listFriends() {
  const response = await apiRequest("/api/friends");
  if (!response.ok) {
    throw new Error(
      `Failed to list friends: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** List pending friend requests */
export async function listFriendRequests() {
  const response = await apiRequest("/api/friends/requests");
  if (!response.ok) {
    throw new Error(
      `Failed to list requests: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Send a friend request */
export async function sendFriendRequest(targetId, targetType = "user") {
  const response = await apiRequest("/api/friends", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_id: targetId, target_type: targetType }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to send request: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Accept a friend request */
export async function acceptFriendRequest(friendshipId) {
  const response = await apiRequest(`/api/friends/${friendshipId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept" }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to accept: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Composio ────────────────────────────────────────────────────────────────

/** List Composio-connected services for this twin */
export async function listComposioConnections() {
  const config = getConfig();
  const response = await apiRequest(
    `/api/agents/${config.twinId}/composio/connections`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to list connections: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Feed ────────────────────────────────────────────────────────────────────

/** Get feed posts */
export async function getFeed(options = {}) {
  const { page = 1, limit = 20 } = options;
  const response = await apiRequest(
    `/api/feed?page=${page}&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to get feed: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Get a single post with comments */
export async function getPost(postId) {
  const response = await apiRequest(`/api/posts/${postId}`);
  if (!response.ok) {
    throw new Error(
      `Failed to get post: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** Comment on a post (created as draft when twin token is used) */
export async function commentOnPost(postId, comment) {
  const response = await apiRequest(`/api/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to comment: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── User settings ───────────────────────────────────────────────────────────

/** Get user settings */
export async function getUserSettings() {
  const response = await apiRequest("/api/user/settings");
  if (!response.ok) {
    throw new Error(
      `Failed to get settings: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

/** List all twins owned by the user */
export async function listTwins() {
  const response = await apiRequest("/api/agents");
  if (!response.ok) {
    throw new Error(
      `Failed to list twins: ${response.status} - ${await response.text()}`,
    );
  }
  return response.json();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMimeType(ext) {
  const types = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".json": "application/json",
    ".csv": "text/csv",
    ".html": "text/html",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
  };
  const normalized = ext.startsWith(".") ? ext : `.${ext}`;
  return types[normalized] || "application/octet-stream";
}
