# Platform API Client Contract

Contract ID: **OCP-002**
Milestone: M0 — Design Freeze
Date: 2026-03-09
Status: **Signed off**

---

## 1. Overview

This document defines the HTTP API contract between the `openclaw-amiko-plugin` and `amiko-platform`'s internal API. The plugin uses three endpoints for all messaging operations:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/internal/openclaw/amiko/events` | Poll inbound events for an account |
| `POST` | `/internal/openclaw/amiko/acks` | Acknowledge processed events/cursor |
| `POST` | `/internal/openclaw/amiko/messages` | Send outbound message from agent to platform |

All endpoints are **internal** (not user-facing). They require a per-account Bearer token.

---

## 2. Authentication

All requests must include:

```
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

The `token` comes from the resolved account config (`channels.amiko.token` or `channels.amiko.accounts.<id>.token`).

Auth failure responses:
- `401 Unauthorized` — token missing or invalid → **fatal**, do not retry, surface as `unhealthy`
- `403 Forbidden` — token valid but not authorized for the requested account scope → **fatal**

---

## 3. `GET /internal/openclaw/amiko/events`

Polls for inbound events for a given account since the last acknowledged cursor.

### 3.1 Request

```
GET /internal/openclaw/amiko/events?accountId=<id>&cursor=<c>&limit=<n>
Authorization: Bearer <token>
```

| Query Parameter | Type | Required | Description |
|----------------|------|----------|-------------|
| `accountId` | string | **Yes** | The account to fetch events for. Must match the token scope. |
| `cursor` | string | No | Opaque resume cursor from the last response. Omit for first poll. |
| `limit` | integer | No | Max events to return. Default: 50. Max: 200. |

### 3.2 Response (200 OK)

```json
{
  "events": [
    {
      "id": "evt_01hzabc123",
      "type": "message.text",
      "accountId": "prod",
      "conversationId": "conv_9ab8c7d6",
      "conversationType": "direct",
      "senderId": "user_1a2b3c",
      "senderName": "Alice",
      "timestamp": 1741478400000,
      "cursor": "cur_eyJpZCI6ImV2dF8wMWh6YWJjMTIzIn0",
      "text": "Hello, can you help me?",
      "mentionsBot": false
    }
  ],
  "nextCursor": "cur_eyJpZCI6ImV2dF8wMWh6YWJjMTI0In0",
  "hasMore": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `events` | array | Ordered list of inbound events (ascending by cursor). May be empty. |
| `nextCursor` | string \| null | Cursor to use in the next poll request. `null` when no events. |
| `hasMore` | boolean | `true` if more events exist beyond `limit`. Poll again immediately. |

### 3.3 Event Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable, globally unique event ID. Used for deduplication. |
| `type` | enum | Yes | One of `message.text`, `message.image`, `participant.added`. |
| `accountId` | string | Yes | Account this event belongs to. |
| `conversationId` | string | Yes | Platform-assigned conversation identifier. |
| `conversationType` | enum | Yes | `"direct"` or `"group"`. |
| `senderId` | string | Yes | Platform user ID of the sender. |
| `senderName` | string | Yes | Display name of the sender at send time. |
| `timestamp` | integer | Yes | Unix timestamp in **milliseconds**. |
| `cursor` | string | Yes | Monotonic cursor value for this event. |
| `text` | string | Conditional | Present for `message.text`. The message body. |
| `mediaUrl` | string | Conditional | Present for `message.image`. Signed URL for media. |
| `mediaCaption` | string | No | Optional caption for media messages. |
| `mentionsBot` | boolean | No | `true` if the message includes a @mention of the bot. Required for group routing. |

### 3.4 Event Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `message.text` | User sent a text message | `text` |
| `message.image` | User sent an image | `mediaUrl` |
| `participant.added` | Bot was added to a group conversation | — (no text/media) |

### 3.5 Cursor Semantics

- The cursor is an **opaque string**. The plugin must not parse or construct cursors.
- Cursors are **monotonic per account**: a cursor always points to events at or after the cursor position.
- On first poll (no stored cursor), omit the `cursor` parameter. The platform returns events from the oldest unacknowledged event.
- After processing events, persist `nextCursor` and use it on the next poll.
- If the platform returns `nextCursor: null` and `hasMore: false`, the plugin should wait `pollIntervalMs` before the next poll.

---

## 4. `POST /internal/openclaw/amiko/acks`

Acknowledges that events up to a given cursor have been processed. Safe to call after each batch.

### 4.1 Request

```
POST /internal/openclaw/amiko/acks
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountId": "prod",
  "cursor": "cur_eyJpZCI6ImV2dF8wMWh6YWJjMTIzIn0",
  "eventIds": ["evt_01hzabc123", "evt_01hzabc124"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | string | Yes | Account scope. Must match token. |
| `cursor` | string | Yes | Cursor of the last event in the batch being acknowledged. |
| `eventIds` | string[] | Yes | IDs of all events in the acknowledged batch. Used for server-side dedup bookkeeping. |

### 4.2 Response (204 No Content)

Empty body on success.

### 4.3 Error Responses

| Status | Meaning | Plugin Behavior |
|--------|---------|-----------------|
| `400` | Invalid cursor or eventIds | Log error, do not retry, continue polling |
| `409` | Stale cursor (older than last ack) | Log warning, update to current cursor, continue |
| `429` | Rate limited | Retriable with backoff |
| `5xx` | Server error | Retriable with backoff |

---

## 5. `POST /internal/openclaw/amiko/messages`

Delivers an outbound message from the agent to the platform for display to the user.

### 5.1 Request

```
POST /internal/openclaw/amiko/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "accountId": "prod",
  "conversationId": "conv_9ab8c7d6",
  "idempotencyKey": "prod:conv_9ab8c7d6:550e8400-e29b-41d4-a716-446655440000",
  "type": "text",
  "text": "Hello! Here's what I found..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountId` | string | Yes | Account scope. Must match token. |
| `conversationId` | string | Yes | Target conversation to deliver the message to. |
| `idempotencyKey` | string | Yes | Client-generated unique key. Server deduplicates on this key within a TTL window. |
| `type` | enum | Yes | `"text"` or `"media"`. |
| `text` | string | Yes | Message text content. For `type=media`, this is the caption fallback. |
| `mediaUrl` | string | Conditional | Required for `type=media`. URL of the media to deliver. |
| `mediaCaption` | string | No | Caption for media messages. |

### 5.2 Idempotency Key

Format: `<accountId>:<conversationId>:<uuid-v4>`

- Generated by the plugin for each send attempt.
- The server must deduplicate writes with the same key within a **24-hour TTL window**.
- On retry, the plugin uses the **same** idempotency key for the same logical send.
- Duplicate requests return a `200` with the original `messageId` (not an error).

### 5.3 Response (200 OK)

```json
{
  "ok": true,
  "messageId": "msg_7f8e9d0c"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | `true` on success. |
| `messageId` | string | Platform-assigned message ID. |

### 5.4 Error Response

```json
{
  "ok": false,
  "error": "Conversation not found",
  "retriable": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | `false` on error. |
| `error` | string | Human-readable error description. |
| `retriable` | boolean | `true` for transient errors (rate limit, server error). `false` for fatal errors (not found, auth). |

### 5.5 Error Status Codes

| Status | `retriable` | Plugin Behavior |
|--------|-------------|-----------------|
| `200` | — | Success or idempotent duplicate. Use returned `messageId`. |
| `400` | false | Bad request (bad payload). Log and skip; do not retry. |
| `401` / `403` | false | Auth failure. Mark account unhealthy. |
| `404` | false | Conversation not found. Log and skip. |
| `409` | false | Duplicate (returned with original messageId). Treat as success. |
| `429` | true | Rate limited. Back off and retry. |
| `5xx` | true | Server error. Retry with exponential backoff. |

---

## 6. Retry Behavior

### 6.1 Polling (`GET /events`)

| Error | Wait | Max Retries | Behavior |
|-------|------|-------------|----------|
| Network timeout | 2s + jitter | unlimited | Jittered backoff up to 30s |
| `429` | Retry-After header or 5s | unlimited | Respect rate limit |
| `5xx` | 5s, 10s, 30s | unlimited | Exponential backoff, cap at 30s |
| `401` / `403` | — | 0 | Mark account unhealthy, stop polling |

### 6.2 Outbound Send (`POST /messages`)

| Error | Retriable | Max Attempts | Behavior |
|-------|-----------|--------------|----------|
| Network timeout | Yes | 3 | Same idempotency key on retry |
| `429` | Yes | 3 | Respect Retry-After |
| `5xx` | Yes | 3 | Exponential backoff |
| `4xx` (not 429) | No | 1 | Log and surface as send failure |

---

## 7. Transport Constraints

- All requests use HTTPS.
- TLS certificate validation is required (no `rejectUnauthorized: false`).
- Request timeout: configurable via `pollTimeoutMs` (default: 10s).
- `Content-Type: application/json` is required on POST requests.
- The plugin must not buffer more than 200 unacknowledged events before acking.

---

## 8. Change Log

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-03-09 | Initial M0 sign-off |
