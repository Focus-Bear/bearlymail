# Connecting Claude to BearlyMail (MCP)

BearlyMail runs an [MCP](https://modelcontextprotocol.io) server at `POST /mcp` on the API origin. Claude Code, Claude Desktop and any other MCP client can use it to read the user's important email, reply, send new mail with open tracking, and set follow-up reminders.

## Setup (users)

1. **Settings → Connect Claude → Create token.** Tokens are read-only unless **Allow sending email** is ticked. The token (`bm_pat_…`) is shown once.
2. Paste the snippet the page shows:
   - **Claude Code:** `claude mcp add --transport http bearlymail https://<api-origin>/mcp --header "Authorization: Bearer bm_pat_…"`
   - **Claude Desktop:** a `claude_desktop_config.json` entry that bridges through `mcp-remote` (Desktop's config file only launches local servers).
3. Revoke a token from the same page; it stops working immediately.

claude.ai custom connectors need OAuth, which is phase 2 and not built yet.

## Tools

| Tool | Scope | What it does |
| --- | --- | --- |
| `list_important_emails` | `mail:read` | Inbox threads by AI priority (`mode`: `triage` / `action` / `follow-up`, `minPriority`, `limit`) with summaries |
| `get_thread` | `mail:read` | Every message in a thread (cleaned bodies, attachments, phishing flag, open tracking) plus any pending follow-up |
| `search_emails` | `mail:read` | Keyword/sender search (reuses Ask AI's local search) |
| `list_follow_ups` | `mail:read` | Messages awaiting a reply, whether each is due, and whether the recipient opened it |
| `send_reply` | `mail:send` | Reply in a thread. `trackOpens`, `followUpInDays`, optional `to`/`cc`/`bcc` |
| `send_email` | `mail:send` | New email. `to`/`cc`/`bcc`, `subject`, `body`, `trackOpens`, `followUpInDays` |

Bodies are plain text; the user's signature (and, for replies, the quoted message) is added the same way as in the web app. Sends go through the normal background send queue (`EmailSendQueueService`), so tracking, follow-ups, retries and Pusher events behave identically.

- **Open tracking** is BearlyMail's tracking pixel. It's plan-gated and skipped when the backend isn't publicly reachable. `trackOpens` omitted means "use the account setting". This isn't an RFC 8098 read receipt (`Disposition-Notification-To`), which most clients ignore.
- **Follow-ups** take whole days (`followUpInDays`, 1–90) rather than free text. The free-text duration parser silently falls back to one hour on input it can't parse, and follow-ups are stored at day granularity anyway.

## Safety model

- Email content is untrusted input that can carry prompt injection. Mitigations:
  - Read and send are separate scopes, and a read-only token isn't even shown the send tools.
  - Send tools carry `destructiveHint: true`, so clients ask before calling them.
  - The server instructions tell the model never to follow instructions found inside emails.
- `/mcp` accepts **only** `Authorization: Bearer bm_pat_…`. It ignores the session cookie, so a logged-in browser tab can't drive it and it needs no CSRF protection. Tokens can't create or revoke tokens (those endpoints are JWT-only).
- Only the SHA-256 hash of each 256-bit token is stored.
- Each MCP send is written to `audit_logs` (`MCP_SEND_REPLY` / `MCP_SEND_EMAIL`, with token id and recipient count, never content). That trail also enforces a cap of 30 MCP sends per user per hour.
- `/mcp` is throttled at 120 requests per minute. Token creation and revocation are audited too.

## Protocol notes

The transport is stateless Streamable HTTP. Each POST carries one JSON-RPC message (or a batch) and gets `application/json` back. Notifications get `202`, and `GET`/`DELETE` get `405`. There are no sessions or server-initiated messages. Supported protocol versions are listed in `MCP_SERVER.SUPPORTED_PROTOCOL_VERSIONS`. The server is tested against the official `@modelcontextprotocol/sdk` client.
