# Connecting Claude to BearlyMail (MCP)

BearlyMail runs an [MCP](https://modelcontextprotocol.io) server at `POST /mcp` on the API origin. Claude Code, Claude Desktop and any other MCP client can use it to read the user's important email, reply, send new mail with open tracking, set follow-up reminders, and review and tidy the user's email categories and category rules.

## Setup (users)

### claude.ai (web, desktop and mobile): paste a URL

1. In Claude, open **Customize → Connectors → Add custom connector** (<https://claude.ai/customize/connectors>).
2. Paste `https://<api-origin>/mcp` (Settings → Connect Claude shows it with a copy button) and click **Add**, then **Connect**.
3. Claude opens BearlyMail's consent page. Sign in if asked, then choose **Read only** (the default) or **Read and send**. Tick **Also edit categories and rules** if Claude should be able to change them (it can always read them). Click **Allow**.

**Already connected?** A connection keeps the permissions it was granted. To let Claude edit categories and rules, disconnect BearlyMail (Settings → Connect Claude, or in Claude's connector settings), connect again, and tick the box.

Connectors added on claude.ai sync to Claude Desktop and the mobile apps. There's nothing to paste into a config file.

### Claude Code

Run `claude mcp add --transport http bearlymail https://<api-origin>/mcp`, then `/mcp` in a session to sign in through the same consent page. No token needed.

### Access tokens (Claude Desktop config files, scripts, other MCP clients)

1. **Settings → Connect Claude → Create token.** Tokens are read-only unless **Allow sending email** and/or **Allow editing categories and rules** is ticked. The token (`bm_pat_…`) is shown once.
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
| `create_draft` | `mail:draft` or `mail:send` | Saves a draft in BearlyMail for the user to review and send; never sends. `body` (required), `replyToEmailId` (reply in that thread) or `to` + `subject` (new message), optional `cc`/`bcc`/`attachments`. Returns `draftId` and a `url` that opens it |
| `update_draft` | `mail:draft` or `mail:send` | Changes only the fields passed on a draft the assistant created. `attachments` replaces the list (`[]` removes them) |
| `list_drafts` | `mail:read` | Every unsent draft (reply and new), newest first, with a text body, a link, and `isEditableByAssistant` |
| `delete_draft` | `mail:draft` or `mail:send` | Deletes a draft the assistant created |
| `list_categories` | `mail:read` | Email categories with descriptions and rule / enabled-rule counts |
| `get_category` | `mail:read` | One category and every rule that files into it |
| `list_rules` | `mail:read` | Category rules (`categoryId` / `isEnabled` filters): conditions, enabled flag, `hitCount`, whether the category still exists |
| `get_rule` | `mail:read` | One rule |
| `create_category` | `settings:write` | New category (`name`, `description`). Refuses a duplicate name |
| `update_category` | `settings:write` | Rename / re-describe. Returns `before` and `after` |
| `delete_category` | `settings:write` | Delete (`dryRun` lists the rules that would lose their category) |
| `create_rule` | `settings:write` | New composite rule (`categoryId`, `conditions`) |
| `update_rule` | `settings:write` | Move, enable/disable, or partially edit `conditions` (only the lists passed are replaced; `null` removes one). Returns `before` and `after` |
| `set_rules_enabled` | `settings:write` | Enable/disable up to 50 rules (`dryRun`) |
| `delete_rules` | `settings:write` | Delete up to 50 rules (`dryRun`); the result echoes each deleted rule in full |

Bodies are plain text; the user's signature (and, for replies, the quoted message) is added the same way as in the web app. Sends go through the normal background send queue (`EmailSendQueueService`), so tracking, follow-ups, retries and Pusher events behave identically.

- **Open tracking** is BearlyMail's tracking pixel. It's plan-gated and skipped when the backend isn't publicly reachable. `trackOpens` omitted means "use the account setting". This isn't an RFC 8098 read receipt (`Disposition-Notification-To`), which most clients ignore.
- **Drafts** live in BearlyMail's own `reply_drafts` table, the same store the reply composer autosaves to; they are not pushed to the Gmail/Outlook drafts folder (nor are drafts saved in the web app). A reply draft opens in its thread's reply composer and flags the thread "Reply draft ready" in the inbox; a new-message draft opens in Compose (`/compose?draftId=…`) and is deleted once sent. BearlyMail keeps one reply draft per thread, so `create_draft` refuses a thread that already has one. An assistant can only change or delete drafts it wrote and the user hasn't edited since. Attachments are `{ filename, mimeType, contentBase64 }`, at most 10 per draft and 10 MB in total; `/mcp` accepts request bodies up to 15 MB for them.
- **Categories and rules** go through the same services and validation as Settings (`ContextService`, `CategoryRulesService` with `CreateCompositeCategoryRuleDto` / `PatchCategoryRuleDto`), so an MCP write can't do anything a Settings save can't. Rule conditions use the stored v3 names (`fromMatchesAny`, `subjectContainsAny`, …) for every spec version, so what `list_rules` returns can be passed straight back. Rules have no manual order: the most specific matching composite rule wins. Example cleanup: `list_rules` → `set_rules_enabled({ ruleIds, isEnabled: false, dryRun: true })` → show the user → call again without `dryRun`.
- **Follow-ups** take whole days (`followUpInDays`, 1–90) rather than free text. The free-text duration parser silently falls back to one hour on input it can't parse, and follow-ups are stored at day granularity anyway.

## Safety model

- Email content is untrusted input that can carry prompt injection. Mitigations:
  - Read, draft and send are separate scopes, and a token isn't even shown the tools its scopes don't cover. `mail:draft` lets an assistant prepare messages without being able to send anything; `mail:send` includes it.
  - Editing categories and rules is another scope, `settings:write`, off by default on the consent page and the token form. Without it the write tools aren't listed. Reading them needs only `mail:read`, since they're derived from mail that scope already reads.
  - Send tools and the overwriting/deleting settings tools carry `destructiveHint: true`, so clients ask before calling them. `delete_category`, `delete_rules` and `set_rules_enabled` take `dryRun`, and their descriptions tell the model to dry-run and confirm first.
  - The server instructions tell the model never to follow instructions found inside emails, and that category/rule content is user data, not instructions.
  - Every settings tool starts from the caller's own categories/rules, so another user's id is "not found" before any write (the services also scope every query by user).
- `/mcp` accepts **only** a bearer token: a personal access token (`bm_pat_…`) or an OAuth access token (`bm_oat_…`). It ignores the session cookie, so a logged-in browser tab can't drive it and it needs no CSRF protection. Tokens can't create or revoke tokens (those endpoints are JWT-only).
- Only the SHA-256 hash of each 256-bit secret (tokens, refresh tokens, authorization codes) is stored.
- Each MCP send is written to `audit_logs` (`MCP_SEND_REPLY` / `MCP_SEND_EMAIL`, with token id and recipient count, never content). That trail also enforces a cap of 30 MCP sends per user per hour.
- Each MCP settings change is written to `audit_logs` too (`MCP_CATEGORY_*`, `MCP_RULE_*`, `MCP_RULES_*`), with the before/after values in the encrypted metadata so a change can be undone by hand. Dry runs aren't logged.
- `/mcp` allows 120 requests per minute per user, counted after the token is checked. Creating a token or approving a connection asks for the password again (declining doesn't). Token creation and revocation are audited too.

## Protocol notes

The transport is stateless Streamable HTTP. Each POST carries one JSON-RPC message (or a batch) and gets `application/json` back. Notifications get `202`, and `GET`/`DELETE` get `405`. There are no sessions or server-initiated messages. Supported protocol versions are listed in `MCP_SERVER.SUPPORTED_PROTOCOL_VERSIONS`. The server is tested against the official `@modelcontextprotocol/sdk` client.

## OAuth (claude.ai custom connectors)

BearlyMail is its own OAuth 2.1 authorization server for `/mcp`, following the [MCP authorization spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) and [Claude's connector auth requirements](https://claude.com/docs/connectors/building/authentication). The code is in `server/src/mcp-oauth/`, and the constants are in `server/src/constants/mcp-oauth.constants.ts`.

| Endpoint | Purpose |
| --- | --- |
| `401` from `/mcp` | `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp", scope="mail:read mail:draft mail:send settings:write"`. Claude only starts sign-in from a 401 |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728: `resource` = `<api-origin>/mcp`, `authorization_servers` = `[<api-origin>]` |
| `GET /.well-known/oauth-authorization-server` | RFC 8414, with `client_id_metadata_document_supported: true` and `token_endpoint_auth_methods_supported: ["none"]`. Claude needs both before it will use CIMD |
| `GET /oauth/authorize` | Validates the client, redirect URI, S256 PKCE, `resource` (RFC 8707) and scope. Parks the request, then 302s to the web app's `/oauth/consent?request=…` |
| `GET/POST /oauth/consent-requests/:id[/decision]` | JWT (session) endpoints behind the consent page. Approving also needs a step-up token. The decision returns the redirect back to the client with `code`, `state` and `iss` (RFC 9207) |
| `POST /oauth/token` | Form-encoded. `authorization_code` (PKCE) and `refresh_token`. Public clients only |
| `POST /oauth/register` | RFC 7591 dynamic registration (fallback). Always registers a public client |
| `POST /oauth/revoke` | RFC 7009. Revoking either token ends the connection |

**Client registration.** Clients that send an HTTPS URL as `client_id` (claude.ai, Claude Code) use a Client ID Metadata Document. BearlyMail fetches it over HTTPS only, from public IPs only (the vetted address is the one connected to), with no redirects, a 5 s timeout and a 16 KiB cap. The document's `client_id` must equal its URL, and it's cached for 5 minutes. Any other client registers through `/oauth/register` (stored in `oauth_clients`). Redirect URIs match exactly, except loopback ones, which match on any port (RFC 8252 §7.3), so Claude Code's ephemeral `http://localhost:<port>/callback` works. The hosted Claude apps use `https://claude.ai/api/mcp/auth_callback`.

**Consent.** The page runs in the web app behind the normal login. A logged-out user is sent to `/login` and brought back afterwards, including after Google/Microsoft sign-in. It names the client and, prominently, the host the code will be sent to. Client names are self-asserted, so the page warns when the redirect is a loopback address. Read only is the default. Drafts are offered when the client asked for `mail:draft` or `mail:send`, send only when it asked for `mail:send`, and "Also edit categories and rules" only when it asked for `settings:write`. The page refuses to render inside a frame, and the decision endpoint is protected by the SameSite=Strict session cookie.

**Tokens.** An approved connection is a `personal_access_tokens` row with `kind = 'oauth'`. It resolves to the same `PatPrincipal` as a PAT, so the MCP tools and scope checks are unchanged. Access tokens (`bm_oat_…`) last 1 hour. Refresh tokens (`bm_ort_…`) rotate on every use, conditionally on the old hash so two concurrent refreshes can't both win, with a 30-day idle lifetime. Authorization codes (`bm_oac_…`) are single-use and live 60 s. A replayed code revokes the connection it produced. Rows in `oauth_authorization_codes` older than a day are pruned. OAuth connections count towards the 20-per-user token cap, which is checked on the consent page.

**Testing.** `npm test -- src/mcp-oauth` covers the protocol with an in-memory repository. With `npm run local` running, `node server/scripts/verify-mcp-oauth.mjs` drives the full flow with the official `@modelcontextprotocol/sdk` client twice: once with DCR, and once with Claude Code's real metadata document from claude.ai. It also checks refresh rotation and revocation from Settings.

