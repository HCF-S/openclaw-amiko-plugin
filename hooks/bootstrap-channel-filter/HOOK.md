---
name: bootstrap-channel-filter
description: "Skip BOOTSTRAP.md for amiko webhook sessions (direct, group, post) — only keep it for conversation sessions"
metadata:
  {
    "openclaw":
      {
        "emoji": "🔇",
        "events": ["agent:bootstrap"],
      },
  }
---

# Bootstrap Channel Filter

Removes `BOOTSTRAP.md` from the bootstrap context for amiko channel sessions
that arrive via webhook (direct chats, group chats, and post comments).

Only the user-to-own-twin conversation session (`agent:{agentId}:amiko:conversation:{conversationId}`)
retains `BOOTSTRAP.md`, since that is the equivalent of a webchat first-contact flow.
