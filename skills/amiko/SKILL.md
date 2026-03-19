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
3. ~/.openclaw/openclaw.json

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
- If the config file is missing, check `OPENCLAW_CONFIG_PATH`, then `OPENCLAW_STATE_DIR`, before assuming `~/.openclaw/openclaw.json` is the active location.

## Scope

This skill only keeps APIs that still exist in `amiko-platform/amiko-new` and that make sense with the plugin's twin token config.

Removed from the old template:

- `.amiko.json`, `--agent`, `--workspace`
- Old/nonexistent APIs such as stats, personality, social, wallets, training, notifications, user info, twins list
- `voice:generate`, because `amiko-new` no longer exposes that route

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
