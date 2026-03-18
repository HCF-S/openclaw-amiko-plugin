#!/usr/bin/env node

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
  uploadDocFromFile,
  checkDocsProcessing,
  deleteDoc,
  getVoice,
  updateVoice,
  designVoice,
  createVoice,
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

const args = process.argv.slice(2);

function parseArgs(argv) {
  const result = { _: [] };
  let index = 0;

  while (index < argv.length) {
    const part = argv[index];
    if (part.startsWith("--")) {
      const key = part.slice(2);
      const next = argv[index + 1];
      const hasValue = next && !next.startsWith("--");
      result[key] = hasValue ? next : true;
      index += hasValue ? 2 : 1;
      continue;
    }

    result._.push(part);
    index += 1;
  }

  return result;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === true) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsv(value) {
  if (!value || value === true) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printUsage() {
  console.log(`
Amiko Skill CLI

Config source:
  ~/.openclaw/openclaw.json -> channels.amiko

Global options:
  --account <agentId>   Select an account from channels.amiko.accounts
                        If omitted, the CLI tries OPENCLAW_AGENT_ID or the current workspace path.

Local commands:
  accounts              List configured account IDs from openclaw.json

API commands:
  info
  twin:update           --name <name> --description <text> --avatar-url <url> --voice-description <text> --public --private

  docs                  [--limit <n>] [--offset <n>] [--search <text>]
  docs:get              --id <docId>
  docs:create           --title <title> --filename <name> --file-url <url> --file-type <mime>
                        [--description <text>] [--doc-type <type>] [--relationship <value>] [--stance <value>]
  docs:upload           --file <path> [--title <title>] [--description <text>] [--doc-type <type>]
                        [--relationship <value>] [--stance <value>]
  docs:upload-file      --file <path>
  docs:presign          --filename <name> [--content-type <mime>]
  docs:check            --id <docId[,docId2]>
  docs:delete           --id <docId>

  voice
  voice:update          [--voice-id <id>] [--status <status>] [--description <text>]
  voice:design          --description <text>
  voice:create          --generated-voice-id <id> [--description <text>]
  voice:clone           --file <path>
  voice:reset

  avatar:update         --file <path>

  friends               [--type <user>] [--favorites]
  friends:search        --query <text>
  friends:requests
  friends:add           --id <userId>
  friends:accept        --id <friendshipId>
  friends:decline       --id <friendshipId>
  friends:remove        --id <friendshipId>

  feed                  [--page <n>] [--limit <n>]
  post                  --id <postId>
  post:comment          --id <postId> --comment <text> [--media-urls <url1,url2>] [--twin-id <twinId>]

  composio:connections
  composio:connect      --app <name> [--redirect-url <url>]
  composio:disconnect   --id <connectionId>

  help

Examples:
  ./skills/amiko/cli.js accounts
  ./skills/amiko/cli.js --account main info
  ./skills/amiko/cli.js docs --search handbook
  ./skills/amiko/cli.js docs:upload --file ./notes.md --title "Notes"
  ./skills/amiko/cli.js voice:design --description "A calm and natural speaking voice with warm tone"
  ./skills/amiko/cli.js friends:add --id <userId>
  ./skills/amiko/cli.js post:comment --id <postId> --comment "Nice post"
`);
}

async function main() {
  const parsed = parseArgs(args);
  const command = parsed._[0];

  if (!command || command === "help" || command === "-h" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  if (parsed.account && parsed.account !== true) {
    setAccountId(parsed.account);
  }

  if (command === "accounts") {
    console.log(JSON.stringify({ accounts: listConfiguredAccounts() }, null, 2));
    return;
  }

  try {
    getConfig();
  } catch (error) {
    let available = [];
    try {
      available = listConfiguredAccounts();
    } catch {}
    const detected = detectCurrentAccountId();
    console.error(`Error: ${error.message}`);
    if (detected) {
      console.error(`Detected current agent/account: ${detected}`);
    }
    if (available.length > 0) {
      console.error(`Configured accounts: ${available.join(", ")}`);
    }
    process.exit(1);
  }

  switch (command) {
    case "info":
      console.log(JSON.stringify(await getTwinInfo(), null, 2));
      return;

    case "twin:update": {
      const data = {};
      if (parsed.name && parsed.name !== true) data.name = parsed.name;
      if (parsed.description && parsed.description !== true) {
        data.description = parsed.description;
      }
      if (parsed["avatar-url"] && parsed["avatar-url"] !== true) {
        data.avatar_url = parsed["avatar-url"];
      }
      if (parsed["voice-description"] && parsed["voice-description"] !== true) {
        data.voice_description = parsed["voice-description"];
      }
      if (parsed.public) data.is_public = true;
      if (parsed.private) data.is_public = false;
      if (Object.keys(data).length === 0) {
        throw new Error("No update fields provided");
      }
      console.log(JSON.stringify(await updateTwin(data), null, 2));
      return;
    }

    case "docs":
      console.log(
        JSON.stringify(
          await listDocs({
            limit: parseNumber(parsed.limit, 50),
            offset: parseNumber(parsed.offset, 0),
            search: parsed.search && parsed.search !== true ? parsed.search : undefined,
          }),
          null,
          2,
        ),
      );
      return;

    case "docs:get":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await getDoc(parsed.id), null, 2));
      return;

    case "docs:create": {
      if (!parsed.title || parsed.title === true) throw new Error("--title is required");
      if (!parsed.filename || parsed.filename === true) {
        throw new Error("--filename is required");
      }
      if (!parsed["file-url"] || parsed["file-url"] === true) {
        throw new Error("--file-url is required");
      }
      if (!parsed["file-type"] || parsed["file-type"] === true) {
        throw new Error("--file-type is required");
      }

      console.log(
        JSON.stringify(
          await createDoc({
            title: parsed.title,
            filename: parsed.filename,
            fileUrl: parsed["file-url"],
            fileType: parsed["file-type"],
            description:
              parsed.description && parsed.description !== true
                ? parsed.description
                : undefined,
            doc_type:
              parsed["doc-type"] && parsed["doc-type"] !== true
                ? parsed["doc-type"]
                : "other",
            relationship:
              parsed.relationship && parsed.relationship !== true
                ? parsed.relationship
                : null,
            stance: parsed.stance && parsed.stance !== true ? parsed.stance : null,
          }),
          null,
          2,
        ),
      );
      return;
    }

    case "docs:upload":
      if (!parsed.file || parsed.file === true) throw new Error("--file is required");
      console.log(
        JSON.stringify(
          await uploadDocFromFile(parsed.file, {
            title: parsed.title && parsed.title !== true ? parsed.title : undefined,
            description:
              parsed.description && parsed.description !== true
                ? parsed.description
                : undefined,
            docType:
              parsed["doc-type"] && parsed["doc-type"] !== true
                ? parsed["doc-type"]
                : "other",
            relationship:
              parsed.relationship && parsed.relationship !== true
                ? parsed.relationship
                : null,
            stance: parsed.stance && parsed.stance !== true ? parsed.stance : null,
          }),
          null,
          2,
        ),
      );
      return;

    case "docs:upload-file":
      if (!parsed.file || parsed.file === true) throw new Error("--file is required");
      console.log(JSON.stringify(await uploadDocFile(parsed.file), null, 2));
      return;

    case "docs:presign":
      if (!parsed.filename || parsed.filename === true) {
        throw new Error("--filename is required");
      }
      console.log(
        JSON.stringify(
          await createDocUploadUrl(
            parsed.filename,
            parsed["content-type"] && parsed["content-type"] !== true
              ? parsed["content-type"]
              : undefined,
          ),
          null,
          2,
        ),
      );
      return;

    case "docs:check":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(
        JSON.stringify(await checkDocsProcessing(parseCsv(parsed.id)), null, 2),
      );
      return;

    case "docs:delete":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await deleteDoc(parsed.id), null, 2));
      return;

    case "voice":
      console.log(JSON.stringify(await getVoice(), null, 2));
      return;

    case "voice:update": {
      const data = {};
      if (parsed["voice-id"] && parsed["voice-id"] !== true) {
        data.voice_id = parsed["voice-id"];
      }
      if (parsed.status && parsed.status !== true) {
        data.voice_status = parsed.status;
      }
      if (parsed.description && parsed.description !== true) {
        data.voice_description = parsed.description;
      }
      if (Object.keys(data).length === 0) {
        throw new Error("At least one voice field is required");
      }
      console.log(JSON.stringify(await updateVoice(data), null, 2));
      return;
    }

    case "voice:design": {
      const description =
        parsed.description && parsed.description !== true
          ? parsed.description
          : parsed._.slice(1).join(" ");
      if (!description) throw new Error("--description is required");
      console.log(JSON.stringify(await designVoice(description), null, 2));
      return;
    }

    case "voice:create":
      if (!parsed["generated-voice-id"] || parsed["generated-voice-id"] === true) {
        throw new Error("--generated-voice-id is required");
      }
      console.log(
        JSON.stringify(
          await createVoice({
            generatedVoiceId: parsed["generated-voice-id"],
            voiceDescription:
              parsed.description && parsed.description !== true
                ? parsed.description
                : undefined,
          }),
          null,
          2,
        ),
      );
      return;

    case "voice:clone":
      if (!parsed.file || parsed.file === true) throw new Error("--file is required");
      console.log(JSON.stringify(await cloneVoiceFromFile(parsed.file), null, 2));
      return;

    case "voice:reset":
      console.log(JSON.stringify(await resetVoice(), null, 2));
      return;

    case "avatar:update":
      if (!parsed.file || parsed.file === true) throw new Error("--file is required");
      console.log(JSON.stringify(await updateAvatar(parsed.file), null, 2));
      return;

    case "friends":
      console.log(
        JSON.stringify(
          await listFriends({
            type: parsed.type && parsed.type !== true ? parsed.type : undefined,
            favoritesOnly: Boolean(parsed.favorites),
          }),
          null,
          2,
        ),
      );
      return;

    case "friends:search":
      if (!parsed.query || parsed.query === true) throw new Error("--query is required");
      console.log(JSON.stringify(await searchFriends(parsed.query), null, 2));
      return;

    case "friends:requests":
      console.log(JSON.stringify(await listFriendRequests(), null, 2));
      return;

    case "friends:add":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await sendFriendRequest(parsed.id), null, 2));
      return;

    case "friends:accept":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await acceptFriendRequest(parsed.id), null, 2));
      return;

    case "friends:decline":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await declineFriendRequest(parsed.id), null, 2));
      return;

    case "friends:remove":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await removeFriendship(parsed.id), null, 2));
      return;

    case "feed":
      console.log(
        JSON.stringify(
          await getFeed({
            page: parseNumber(parsed.page, 1),
            limit: parseNumber(parsed.limit, 20),
          }),
          null,
          2,
        ),
      );
      return;

    case "post":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(JSON.stringify(await getPost(parsed.id), null, 2));
      return;

    case "post:comment":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      if (!parsed.comment || parsed.comment === true) {
        throw new Error("--comment is required");
      }
      console.log(
        JSON.stringify(
          await commentOnPost(parsed.id, parsed.comment, {
            mediaUrls: parseCsv(parsed["media-urls"]),
            twinId:
              parsed["twin-id"] && parsed["twin-id"] !== true
                ? parsed["twin-id"]
                : undefined,
          }),
          null,
          2,
        ),
      );
      return;

    case "composio:connections":
      console.log(JSON.stringify(await listComposioConnections(), null, 2));
      return;

    case "composio:connect":
      if (!parsed.app || parsed.app === true) throw new Error("--app is required");
      console.log(
        JSON.stringify(
          await connectComposioApp(
            parsed.app,
            parsed["redirect-url"] && parsed["redirect-url"] !== true
              ? parsed["redirect-url"]
              : undefined,
          ),
          null,
          2,
        ),
      );
      return;

    case "composio:disconnect":
      if (!parsed.id || parsed.id === true) throw new Error("--id is required");
      console.log(
        JSON.stringify(
          await disconnectComposioConnection(parsed.id),
          null,
          2,
        ),
      );
      return;

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
