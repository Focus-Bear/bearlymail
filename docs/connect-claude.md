# Connecting Claude to BearlyMail (MCP)

BearlyMail runs an [MCP](https://modelcontextprotocol.io) server at `POST /mcp` on the API origin. Claude Code, Claude Desktop and any other MCP client can use it to read the user's important email, reply, send new mail with open tracking, and set follow-up reminders.

## Setup (users)

### claude.ai (web, desktop and mobile): paste a URL

1. In Claude, open **Customize → Connectors → Add custom connector** (<https://claude.ai/customize/connectors>).
2. Paste `https://<api-origin>/mcp` (Settings → Connect Claude shows it with a copy button) and click **Add**, then **Connect**.
3. Claude opens BearlyMail's consent page. Sign in if asked, then choose **Read only** (the default) or **Read and send**, and click **Allow**.

Connectors added on claude.ai sync to Claude Desktop and the mobile apps. There's nothing to paste into a config file.

### Claude Code

Run `claude mcp add --transport http bearlymail https://<api-origin>/mcp`, then `/mcp` in a session to sign in through the same consent page. No token needed.

### Access tokens (Claude Desktop config files, scripts, other MCP clients)

1. **Settings → Connect Claude → Create token.** Tokens are read-only unless **Allow sending email** is ticked. The token (`bm_pat_…`) is shown once.
2. Paste the snippet the page shows:
   - **Claude Code:** `claude mcp add --transport http bearlymail https://<api-origin>/mcp --header "Authorization: Bearer bm_pat_…"`
   - **Claude Desktop:** a `claude_desktop_config.json` entry that bridges through `mcp-remote` (Desktop's config file only launches local servers).

### Revoking

Settings → Connect Claude lists OAuth connections ("Claude (claude.ai)") alongside tokens. **Disconnect** / **Revoke** stops it immediately. An OAuth connection that goes unused for 30 days lapses on its own.

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
- `/mcp` accepts **only** a bearer token: a personal access token (`bm_pat_…`) or an OAuth access token (`bm_oat_…`). It ignores the session cookie, so a logged-in browser tab can't drive it and it needs no CSRF protection. Tokens can't create or revoke tokens (those endpoints are JWT-only).
- Only the SHA-256 hash of each 256-bit secret (tokens, refresh tokens, authorization codes) is stored.
- Each MCP send is written to `audit_logs` (`MCP_SEND_REPLY` / `MCP_SEND_EMAIL`, with token id and recipient count, never content). That trail also enforces a cap of 30 MCP sends per user per hour.
- `/mcp` is throttled at 120 requests per minute per token. The throttler keys bearer-token requests by the token's hash, because `req.ip` is the load balancer and claude.ai traffic all comes from Anthropic's IP range. Token creation and revocation are audited too, as are OAuth grants and denials (`MCP_OAUTH_GRANTED` / `MCP_OAUTH_DENIED`).

## Protocol notes

The transport is stateless Streamable HTTP. Each POST carries one JSON-RPC message (or a batch) and gets `application/json` back. Notifications get `202`, and `GET`/`DELETE` get `405`. There are no sessions or server-initiated messages. Supported protocol versions are listed in `MCP_SERVER.SUPPORTED_PROTOCOL_VERSIONS`. The server is tested against the official `@modelcontextprotocol/sdk` client.

## OAuth (claude.ai custom connectors)

BearlyMail is its own OAuth 2.1 authorization server for `/mcp`, following the [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [Claude's connector auth requirements](https://claude.com/docs/connectors/building/authentication). The code is in `server/src/mcp-oauth/`, and the constants are in `server/src/constants/mcp-oauth.constants.ts`.

| Endpoint | Purpose |
| --- | --- |
| `401` from `/mcp` | `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp", scope="mail:read mail:send"`. Claude only starts sign-in from a 401 |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728: `resource` = `<api-origin>/mcp`, `authorization_servers` = `[<api-origin>]` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414, with `client_id_metadata_document_supported: true` and `token_endpoint_auth_methods_supported: ["none"]`. Claude needs both before it will use CIMD |
| `GET /oauth/authorize` | Validates the client, redirect URI, S256 PKCE, `resource` (RFC 8707) and scope. Parks the request, then 302s to the web app's `/oauth/consent?request=…` |
| `GET/POST /oauth/consent-requests/:id[/decision]` | JWT (session) endpoints behind the consent page. The decision returns the redirect back to the client with `code`, `state` and `iss` (RFC 9207) |
| `POST /oauth/token` | Form-encoded. `authorization_code` (PKCE) and `refresh_token`. Public clients only |
| `POST /oauth/register` | RFC 7591 dynamic registration (fallback). Always registers a public client |
| `POST /oauth/revoke` | RFC 7009. Revoking either token ends the connection |

**Client registration.** Clients that send an HTTPS URL as `client_id` (claude.ai, Claude Code) use a Client ID Metadata Document. BearlyMail fetches it over HTTPS only, from public IPs only (the vetted address is the one connected to), with no redirects, a 5 s timeout and a 16 KiB cap. The document's `client_id` must equal its URL, and it's cached for 5 minutes. Any other client registers through `/oauth/register` (stored in `oauth_clients`). Redirect URIs match exactly, except loopback ones, which match on any port (RFC 8252 §7.3), so Claude Code's ephemeral `http://localhost:<port>/callback` works. The hosted Claude apps use `https://claude.ai/api/mcp/auth_callback`.

**Consent.** The page runs in the web app behind the normal login. A logged-out user is sent to `/login` and brought back afterwards, including after Google/Microsoft sign-in. It names the client and, prominently, the host the code will be sent to. Client names are self-asserted, so the page warns when the redirect is a loopback address. Read only is the default. Send is offered only when the client asked for `mail:send`. The page refuses to render inside a frame, and the decision endpoint is protected by the SameSite=Strict session cookie.

**Tokens.** An approved connection is a `personal_access_tokens` row with `kind = 'oauth'`. It resolves to the same `PatPrincipal` as a PAT, so the MCP tools and scope checks are unchanged. Access tokens (`bm_oat_…`) last 1 hour. Refresh tokens (`bm_ort_…`) rotate on every use, conditionally on the old hash so two concurrent refreshes can't both win, with a 30-day idle lifetime. Authorization codes (`bm_oac_…`) are single-use and live 60 s. A replayed code revokes the connection it produced. Rows in `oauth_authorization_codes` older than a day are pruned. OAuth connections count towards the 20-per-user token cap, which is checked on the consent page.

**Testing.** `npm test -- src/mcp-oauth` covers the protocol with an in-memory repository. With `npm run local` running, `node server/scripts/verify-mcp-oauth.mjs` drives the full flow with the official `@modelcontextprotocol/sdk` client twice: once with DCR, and once with Claude Code's real metadata document from claude.ai. It also checks refresh rotation and revocation from Settings.

