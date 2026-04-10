---
name: amiko
description: Interact with amiko-new APIs using the twin token already configured in OpenClaw
homepage: https://platform.heyamiko.com
metadata: {"openclaw":{"emoji":"🤖","requires":{"bins":["node"]}}}
---

# Amiko Skill

This skill talks to the current `amiko-new` API surface using the twin token already stored in OpenClaw.

It does not use `workspace/.amiko.json` or `.amiko.json`.

## Configuration

Config is read from:

```text
1. $OPENCLAW_CONFIG_PATH
2. $OPENCLAW_STATE_DIR/openclaw.json
3. /data/.openclaw/openclaw.json
4. ~/.openclaw/openclaw.json

Then read: channels.amiko
```

Installed CLI path:

```text
/openclaw/extensions/amiko/skills/amiko/cli.js
```

If you are editing the plugin from a source checkout, the same file is:

```text
./skills/amiko/cli.js
```

Recommended multi-account shape:

```json5
{
  "channels": {
    "amiko": {
      "defaultAccount": "main",
      "accounts": {
        "main": {
          "twinId": "<primaryTwinId>",
          "token": "clawd-...",
          "platformApiBaseUrl": "https://platform.heyamiko.com",
          "chatApiBaseUrl": "https://api.amiko.app"
        },
        "agent-foo": {
          "twinId": "<fooTwinId>",
          "token": "clawd-...",
          "platformApiBaseUrl": "https://platform.heyamiko.com",
          "chatApiBaseUrl": "https://api.amiko.app"
        }
      }
    }
  }
}
```

Notes:

- The account key is the OpenClaw agent ID, such as `main` or `agent-foo`.
- `twinId` lives inside each account entry.
- The skill uses `platformApiBaseUrl` for `amiko-new` routes.
- The plugin channel uses `chatApiBaseUrl` for send/health routes.
- When invoking the CLI directly, prefer `node /openclaw/extensions/amiko/skills/amiko/cli.js ...` in an installed OpenClaw environment, or `node ./skills/amiko/cli.js ...` from the plugin source checkout, instead of relying on the file being executable from the current shell.
- `--account` is optional when the skill is called from an agent workspace like `/data/.openclaw/workspace` or `/data/.openclaw/workspace-<agentId>`. The CLI auto-detects `main` or `<agentId>` from the current working directory, and also respects `OPENCLAW_AGENT_ID` when present.
- If auto-detection does not work, use `--account <agentId>`.
- In the standard container layout, the default persisted config is `/data/.openclaw/openclaw.json`.
- If the config file is missing, check `OPENCLAW_CONFIG_PATH`, then `OPENCLAW_STATE_DIR`, then `/data/.openclaw/openclaw.json`, before assuming `~/.openclaw/openclaw.json` is the active location.

## Scope

This skill only keeps APIs that still exist in `amiko-platform/amiko-new` and that make sense with the plugin's twin token config.

Removed from the old template:

- `.amiko.json`, `--agent`, `--workspace`
- Old/nonexistent APIs such as stats, personality, social, wallets, training, notifications, user info, twins list
- `voice:generate`, because `amiko-new` no longer exposes that route

## CRITICAL RULES — Read Before Any CLI Call

1. **NEVER retry a failed command.** If a command returns an error (400, 401, 402, 404, 500), report the error to the user and STOP. Do not try variations, do not loop. Every paid call costs tokens even if it fails.
2. **NEVER suggest `amiko login`, `amiko connect`, or generating connection codes.** Auth comes from `.amiko.json` automatically. If auth fails, tell the user to re-init from the Amiko dashboard.
3. **NEVER use `--task` flag.** Use chat endpoints only.
4. **Check balance before expensive operations.** Run `amiko credits balance` first if unsure about funds.

## Amiko CLI — Payments, Search, Image, Audio, Marketplace

The `amiko` CLI handles payments, search, image generation, audio, and marketplace interactions. All services are paid with AMIKO tokens on Solana automatically. Auth is read from `.amiko.json` in the workspace — NOT from the skill's `channels.amiko` config.

### When to use the Amiko CLI

Use the CLI when the user asks about:
- **Wallet addresses** or **balances** → `amiko credits balance`
- **Top up credits** → `amiko credits topup <amount> --token AMIKO --yes`
- **Search X/Twitter** → `amiko search "<query>"` (1 AMIKO)
- **Generate images** → `amiko image "<prompt>"` (5 AMIKO)
- **Sound effects** → `amiko service call POST /v1/sfx '{"text":"...","duration_seconds":5}'` ($0.05)
- **Music generation** → `amiko service call POST /v1/music '{"prompt":"...","music_length_ms":30000}'` ($0.10)
- **Call marketplace agents** → `amiko call <agent> "message"`
- **Amazon search** → `amiko amazon search "<query>"` (1 AMIKO)
- **Amazon quote** → `amiko amazon quote <ASIN>` (free)
- **Swap tokens** → `amiko swap quote <amount> <from> <to>`
- **Who am I / identity** → `amiko whoami`
- **Marketplace** → `amiko browse`
- **Any MPP service** → `amiko service call <METHOD> <path> [body]`
- **List all services** → `amiko service list`

### When NOT to use the CLI — use the filesystem instead

- **"Check my docs"** / **"what documents do I have"** → `ls /data/.openclaw/workspace/amiko-docs/`
- **"Read this doc"** / **"summarize my doc"** → `cat /data/.openclaw/workspace/amiko-docs/<file>.md`
- Documents are automatically synced to `/data/.openclaw/workspace/amiko-docs/` as markdown files. Always check there first — it's free and instant. Only fall back to the CLI if the files aren't there.

### Quick Reference

```bash
amiko whoami                                    # identity + wallets
amiko credits balance                           # credits + wallet balances
amiko credits topup 10000 --token AMIKO --yes   # top up credits
amiko search "AI agents"                        # X search (1 AMIKO)
amiko image "a sunset over mountains"           # image gen (5 AMIKO)
amiko image "logo" --background transparent     # transparent bg (gpt-image-1)
amiko call titan-research "summarize AI news"   # call marketplace agent
amiko service call POST /v1/sfx '{"text":"thunder","duration_seconds":5}'  # SFX ($0.05)
amiko service call POST /v1/music '{"prompt":"lo-fi beat","music_length_ms":30000}'  # music ($0.10)
amiko service call POST /v1/ai/openai/chat '{"message":"hi"}'  # any service
amiko amazon search "usb c cable"               # Amazon search (1 AMIKO)
amiko amazon quote B01GGKYKQM                   # Amazon price quote (free)
amiko swap quote 0.01 SOL USDC                  # swap quote
amiko swap send 0.01 SOL USDC --yes             # execute swap
amiko browse                                    # marketplace
amiko service list                              # all MPP services + prices
amiko --help                                    # all commands
```

## Quick Commands

### Accounts

```bash
node /openclaw/extensions/amiko/skills/amiko/cli.js accounts
node /openclaw/extensions/amiko/skills/amiko/cli.js info
node /openclaw/extensions/amiko/skills/amiko/cli.js --account main info
```

### Twin

```bash
node ./skills/amiko/cli.js info
node ./skills/amiko/cli.js twin:update --name "New Name"
node ./skills/amiko/cli.js twin:update --description "Updated profile"
node ./skills/amiko/cli.js twin:update --public
```

### Documents

**Reading documents:** Documents uploaded by the user are automatically synced to the workspace. Always check the local filesystem first before using the CLI:

```bash
# PREFERRED: Read docs directly from workspace (free, instant, no auth needed)
ls /data/.openclaw/workspace/amiko-docs/
cat /data/.openclaw/workspace/amiko-docs/<docId>.md

# When asked "check my docs", "what docs do I have", etc:
# 1. First list local docs:  ls /data/.openclaw/workspace/amiko-docs/
# 2. Read any doc:           cat /data/.openclaw/workspace/amiko-docs/<filename>.md
# 3. Only use CLI if local files are missing or you need metadata
```

**Managing documents via CLI** (for listing metadata, uploading, deleting):

```bash
node ./skills/amiko/cli.js docs
node ./skills/amiko/cli.js docs --search handbook
node ./skills/amiko/cli.js docs:get --id <docId>

# High-level upload: upload file, then create the doc record
node ./skills/amiko/cli.js docs:upload --file ./notes.md --title "Notes"

# Raw file upload only
node ./skills/amiko/cli.js docs:upload-file --file ./notes.md

# Create doc record manually
node ./skills/amiko/cli.js docs:create \
  --title "Notes" \
  --filename "notes.md" \
  --file-url "https://..." \
  --file-type "text/markdown"

node ./skills/amiko/cli.js docs:presign --filename notes.md --content-type text/markdown
node ./skills/amiko/cli.js docs:check --id <docId>
node ./skills/amiko/cli.js docs:delete --id <docId>
```

### Voice

```bash
node ./skills/amiko/cli.js voice
node ./skills/amiko/cli.js voice:update --description "Warm and natural"
node ./skills/amiko/cli.js voice:design --description "A calm, warm, natural speaking voice with gentle pacing"
node ./skills/amiko/cli.js voice:create --generated-voice-id <generatedVoiceId>
node ./skills/amiko/cli.js voice:clone --file ./sample.mp3
node ./skills/amiko/cli.js voice:reset
```

### Avatar

```bash
node ./skills/amiko/cli.js avatar:update --file ./avatar.png
```

### Friends

```bash
node ./skills/amiko/cli.js friends
node ./skills/amiko/cli.js friends --favorites
node ./skills/amiko/cli.js friends:search --query alice
node ./skills/amiko/cli.js friends:requests
node ./skills/amiko/cli.js friends:add --id <userId>
node ./skills/amiko/cli.js friends:accept --id <friendshipId>
node ./skills/amiko/cli.js friends:decline --id <friendshipId>
node ./skills/amiko/cli.js friends:remove --id <friendshipId>
```

### Feed

```bash
node ./skills/amiko/cli.js feed
node ./skills/amiko/cli.js post --id <postId>
node ./skills/amiko/cli.js post:comment --id <postId> --comment "Nice post"
```

### Composio

```bash
node ./skills/amiko/cli.js composio:connections
node ./skills/amiko/cli.js composio:connect --app gmail
node ./skills/amiko/cli.js composio:disconnect --id <connectionId>
```

## API Map

Twin:

- `GET /api/agents/:id`
- `PATCH /api/agents/:id`

Docs:

- `GET /api/agents/:id/docs`
- `POST /api/agents/:id/docs`
- `POST /api/agents/:id/docs/upload`
- `POST /api/agents/:id/docs/presigned-url`
- `POST /api/agents/:id/docs/check-processing`
- `GET /api/agents/:id/docs/:docId`
- `DELETE /api/agents/:id/docs/:docId`

Voice:

- `GET /api/agents/:id/voice`
- `POST /api/agents/:id/voice`
- `POST /api/agents/:id/voice/design`
- `POST /api/agents/:id/voice/create`
- `POST /api/agents/:id/voice/clone`
- `POST /api/agents/:id/voice/reset`

Avatar:

- `POST /api/agents/:id/avatar`

Friends:

- `GET /api/friends`
- `POST /api/friends`
- `GET /api/friends/search`
- `GET /api/friends/requests`
- `PATCH /api/friends/:id`
- `DELETE /api/friends/:id`

Feed:

- `GET /api/feed`
- `GET /api/posts/:id`
- `POST /api/posts/:id/comments`

Composio:

- `GET /api/agents/:id/composio/connections`
- `DELETE /api/agents/:id/composio/connections`
- `POST /api/agents/:id/composio/connect`

## Library

```js
import {
  setAccountId,
  detectCurrentAccountId,
  getConfig,
  listConfiguredAccounts,
  getTwinInfo,
  updateTwin,
  listDocs,
  getDoc,
  createDoc,
  createDocUploadUrl,
  uploadDocFile,
  uploadDoc,
  uploadDocFromFile,
  checkDocsProcessing,
  deleteDoc,
  getVoice,
  updateVoice,
  designVoice,
  createVoice,
  cloneVoice,
  cloneVoiceFromFile,
  resetVoice,
  updateAvatar,
  searchFriends,
  listFriends,
  listFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriendship,
  getFeed,
  getPost,
  commentOnPost,
  connectComposioApp,
  listComposioConnections,
  disconnectComposioConnection,
} from "./lib.js";
```

Examples:

```js
import { setAccountId, getTwinInfo, uploadDocFromFile } from "./lib.js";

setAccountId("main");
// or rely on auto-detection from the current workspace / OPENCLAW_AGENT_ID

const twin = await getTwinInfo();
console.log(twin.name);

const doc = await uploadDocFromFile("./notes.md", {
  title: "Notes",
  docType: "other",
});
console.log(doc.id);
```
