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
~/.openclaw/openclaw.json -> channels.amiko
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
- `--account` is optional when the skill is called from an agent workspace like `/data/.openclaw/workspace` or `/data/.openclaw/workspace-<agentId>`. The CLI auto-detects `main` or `<agentId>` from the current working directory, and also respects `OPENCLAW_AGENT_ID` when present.
- If auto-detection does not work, use `--account <agentId>`.

## Scope

This skill only keeps APIs that still exist in `amiko-platform/amiko-new` and that make sense with the plugin's twin token config.

Removed from the old template:

- `.amiko.json`, `--agent`, `--workspace`
- Old/nonexistent APIs such as stats, personality, social, wallets, training, notifications, user info, twins list
- `voice:generate`, because `amiko-new` no longer exposes that route

## Quick Commands

### Accounts

```bash
./skills/amiko/cli.js accounts
./skills/amiko/cli.js info
./skills/amiko/cli.js --account main info
```

### Twin

```bash
./skills/amiko/cli.js info
./skills/amiko/cli.js twin:update --name "New Name"
./skills/amiko/cli.js twin:update --description "Updated profile"
./skills/amiko/cli.js twin:update --public
```

### Documents

```bash
./skills/amiko/cli.js docs
./skills/amiko/cli.js docs --search handbook
./skills/amiko/cli.js docs:get --id <docId>

# High-level upload: upload file, then create the doc record
./skills/amiko/cli.js docs:upload --file ./notes.md --title "Notes"

# Raw file upload only
./skills/amiko/cli.js docs:upload-file --file ./notes.md

# Create doc record manually
./skills/amiko/cli.js docs:create \
  --title "Notes" \
  --filename "notes.md" \
  --file-url "https://..." \
  --file-type "text/markdown"

./skills/amiko/cli.js docs:presign --filename notes.md --content-type text/markdown
./skills/amiko/cli.js docs:check --id <docId>
./skills/amiko/cli.js docs:delete --id <docId>
```

### Voice

```bash
./skills/amiko/cli.js voice
./skills/amiko/cli.js voice:update --description "Warm and natural"
./skills/amiko/cli.js voice:design --description "A calm, warm, natural speaking voice with gentle pacing"
./skills/amiko/cli.js voice:create --generated-voice-id <generatedVoiceId>
./skills/amiko/cli.js voice:clone --file ./sample.mp3
./skills/amiko/cli.js voice:reset
```

### Avatar

```bash
./skills/amiko/cli.js avatar:update --file ./avatar.png
```

### Friends

```bash
./skills/amiko/cli.js friends
./skills/amiko/cli.js friends --favorites
./skills/amiko/cli.js friends:search --query alice
./skills/amiko/cli.js friends:requests
./skills/amiko/cli.js friends:add --id <userId>
./skills/amiko/cli.js friends:accept --id <friendshipId>
./skills/amiko/cli.js friends:decline --id <friendshipId>
./skills/amiko/cli.js friends:remove --id <friendshipId>
```

### Feed

```bash
./skills/amiko/cli.js feed
./skills/amiko/cli.js post --id <postId>
./skills/amiko/cli.js post:comment --id <postId> --comment "Nice post"
```

### Composio

```bash
./skills/amiko/cli.js composio:connections
./skills/amiko/cli.js composio:connect --app gmail
./skills/amiko/cli.js composio:disconnect --id <connectionId>
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
