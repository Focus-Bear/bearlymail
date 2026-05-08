# BearlyMail Data Classification Policy

**Effective Date**: 2026-05-07
**Last Reviewed**: 2026-05-07
**Next Review Due**: 2027-05-07 (annual)
**Owner**: BearlyMail Security Team
**SAQ Reference**: SAQ Q4 — Data classification policy

---

## Purpose

This policy formalises the data classification tiers that are already enforced in code.  It provides a single reference for engineers, security reviewers, and auditors to understand which data is considered sensitive, what controls are required for each tier, and where in the codebase those controls are applied.

The encryption-at-rest pattern used throughout the codebase is documented in [CLAUDE.md](../CLAUDE.md) (§ "Key Design Patterns → 1. Encryption at Rest") and is implemented in [`server/src/encryption/`](../server/src/encryption/).

---

## Classification Tiers

| Tier | Sensitivity | Default Handling |
|---|---|---|
| **Restricted** | Highest | Encrypted at rest + in transit; tightly access-controlled; never logged |
| **Confidential** | High | Encrypted at rest + in transit; accessed only by owning user or service |
| **Internal** | Medium | In transit encryption required; no PII; limited retention |
| **Public** | Low | No special controls required |

---

## Tier 1 — Restricted

### Definition

Credentials, cryptographic material, and long-lived secrets whose compromise could grant an attacker full access to user data or platform infrastructure.

### Examples

| Data | Location |
|---|---|
| `ENCRYPTION_KEY` / per-user KMS data keys | `server/src/encryption/encryption-key-provider.ts`, `User.encryptedDataKey` |
| Google OAuth access + refresh tokens | `GoogleAccount.accessToken`, `GoogleAccount.refreshToken` (`google_accounts` table) |
| Microsoft OAuth access + refresh tokens | `Office365Account.accessToken`, `Office365Account.refreshToken` (`office365_accounts` table) |
| Zoho OAuth access + refresh tokens | `ZohoAccount.accessToken`, `ZohoAccount.refreshToken` (`zoho_accounts` table) |
| User-supplied API keys (`openAiApiKey`, `anthropicApiKey`, `githubToken`) | `User` entity, `users` table |
| Google Calendar OAuth tokens (`googleCalendarAccessToken`, `googleCalendarRefreshToken`) | `User` entity, `users` table |
| TOTP secret for MFA (`totpSecret`) | `User` entity, `users` table |
| Password hash + password reset tokens | `User.password`, `User.passwordResetToken`, `users` table |
| AWS KMS key ID (`KMS_KEY_ID` env var) | Environment / AWS Secrets Manager |
| JWT signing secret (`JWT_SECRET` env var) | Environment / AWS Secrets Manager |

### Required Controls

| Control | Requirement |
|---|---|
| **Encryption at rest** | All OAuth tokens and API keys are stored encrypted using AES-256-GCM via `encryptedColumnTransformer` or `globalEncryptedColumnTransformer` (see [`encryption.helper.ts`](../server/src/encryption/encryption.helper.ts)). The `ENCRYPTION_KEY` itself is stored only in the environment / AWS Secrets Manager — never in the database. |
| **Encryption in transit** | TLS 1.2+ required on all API endpoints. OAuth tokens are transmitted only over HTTPS to provider endpoints. |
| **Access control** | OAuth tokens are fetched by the owning user's service context only. `KMS_KEY_ID`, `JWT_SECRET`, and `ENCRYPTION_KEY` are injected via environment variables and are not accessible through any API endpoint. |
| **Logging** | Restricted data must **never** appear in application logs, error messages, or PostHog/Sentry events. Log entries must not include token values, key material, or decrypted credentials. |
| **Sharing / third-party transmission** | OAuth tokens are forwarded to their respective providers (Google, Microsoft, Zoho) only for API calls on behalf of the user. They are never sent to LLM providers. |
| **Backups** | RDS automated backups contain encrypted token columns. The plaintext `ENCRYPTION_KEY` is never backed up to RDS. Backups are retained per the [Data Retention Policy](data-retention-policy.md). |
| **Retention** | Tokens are deleted when the linked account is disconnected or the user account is deleted. Password reset tokens expire after 1 hour (`User.passwordResetExpires`). |
| **Key rotation** | Key rotation is supported via the `data-reencryption` job (`server/src/encryption/data-reencryption/`). KMS envelope encryption supports per-user key rotation through `KmsEncryptionService`. |
| **Incident response** | Any suspected compromise of `ENCRYPTION_KEY`, `JWT_SECRET`, or OAuth token storage requires immediate key rotation, forced re-login of all sessions (`User.needsRelogin = true`), and notification to affected users within 72 hours per GDPR Art. 33. |

---

## Tier 2 — Confidential

### Definition

Personal data and email content that is private to an individual user.  Compromise would expose the user's communications, identity, or personal context.

### Examples

| Data | Location |
|---|---|
| Email addresses (`from`, `to`, `cc`, `replyTo`) | `Email` entity (`emails` table) |
| Email subject, body, HTML body | `Email.subject`, `Email.body`, `Email.htmlBody` |
| Email summaries (LLM-generated) | `Email.summary` |
| Email attachment metadata | `Email.attachments` (JSON) |
| Email labels | `Email.labels` (JSON) |
| Priority/urgency explanations (LLM-generated) | `EmailThread.priorityExplanation`, `EmailThread.urgencyExplanation` |
| Email category explanation | `EmailThread.categoryExplanation` |
| GitHub link metadata per thread | `EmailThread.githubMetadata` |
| User name, display name, job title | `User.name`, `User.displayName`, `User.jobTitle` |
| User email address | `User.email` (encrypted), `User.emailHash` (SHA-256 hash for lookups) |
| User tone settings and auto-responder config | `User.toneSettings`, `User.autoResponderSettings` |
| User calendar booking URL | `User.calendarBookingUrl` |
| User email signature | `User.emailSignature` |
| Private notes | `PrivateNote.content` (`private_notes` table) |
| Learned user context (VIP contacts, goals, Q&A) | `UserContext.contextValue` (`user_contexts` table) |
| Suggested replies, reply drafts | `SuggestedReply`, `ReplyDraft` entities |
| Follow-up drafts | `FollowUp` entity |
| Action items extracted from emails | `ActionItem` entity |
| Contact details (name, email, phone) | `Contact` entity |
| Priority override reasons | `Email.priorityOverrideReason` |
| Meeting proposal details | `EmailThread.meetingProposal` |

### Required Controls

| Control | Requirement |
|---|---|
| **Encryption at rest** | All Confidential fields are stored encrypted using AES-256-GCM column transformers (`encryptedColumnTransformer`, `encryptedJsonTransformer`, `globalEncryptedColumnTransformer`). User entity fields use `globalEncryptedColumnTransformer` (global key) due to JWT bootstrap ordering; all other entity fields use the per-user key when KMS is enabled. |
| **Encryption in transit** | TLS 1.2+ required. All API responses are served over HTTPS. |
| **Access control** | All email-related API endpoints are guarded by `JwtAuthGuard` + `GmailRequiredGuard`. Users can only access their own data (user-scoped queries enforce `WHERE userId = :userId`). |
| **Logging** | Confidential data must **not** appear in log output. The query logger (`server/src/database/query-logger.ts`) logs slow queries by SQL shape but not parameter values containing encrypted content. CloudWatch log groups (`/ecs/bearlymail/web`, `/ecs/bearlymail/worker`) retain logs for 90 days per the [Data Retention Policy](data-retention-policy.md). |
| **LLM transmission** | Email content sent to LLM providers (OpenAI, Google Gemini) may contain Confidential data. PII redaction (`server/src/context/context-pii-redaction.service.ts`) replaces names with `[Name]` before sending to LLMs where applicable. Users may supply their own API keys to route LLM calls to their own accounts. |
| **Sharing / third-party** | Email content is forwarded to the user's linked email provider (Gmail, Office365, Zoho) for send/reply operations only. It is not shared with any other third party. |
| **Backups** | Covered under the [Data Retention Policy](data-retention-policy.md). Backups contain encrypted column data only. |
| **Retention** | Deleted when the user account is deleted (cascade deletes). Automated inactivity deletion applies after 30 days of inactivity. |
| **Incident response** | Suspected unauthorised access to Confidential data requires investigation within 24 hours, affected-user notification per GDPR Art. 33/34, and containment (token rotation, session invalidation). |

---

## Tier 3 — Internal

### Definition

Operational and analytics data that is not personal in nature but is proprietary to BearlyMail.  No individual's email content or identity is included.

### Examples

| Data | Location |
|---|---|
| LLM token usage counts per operation type | `TokenUsage` entity (`token_usages` table), `server/src/llm/token-usage.service.ts` |
| Performance metrics (span timings, budget violations) | `server/src/emails/performance-tracker.ts`, `server/logs/performance.log` |
| CloudWatch application logs (request method, path, status code, duration — no PII) | `/ecs/bearlymail/web`, `/ecs/bearlymail/worker` |
| Queue health metrics (job counts, failure rates) | `server/src/queue/queue-monitor.service.ts` |
| Context analysis progress (0-100%) | `ContextAnalysis` entity (`context_analyses` table) — stores only progress %, not content |
| Sync history metadata (sync timestamps, counts) | `SyncHistoryLog` entity (`sync_history_logs` table) |
| Waitlist signups (email hash, waitlist position) | `Waitlist` entity — email address is hashed (SHA-256), not stored plaintext |
| Subscription status flags | `User.subscriptionStatus`, `User.subscriptionExpiresAt` (non-PII operational flags) |
| PostHog usage analytics (feature usage events) | PostHog — anonymised; configured via `REACT_APP_POSTHOG_API_KEY` |
| AWS CloudWatch metrics (ECS CPU/memory, ALB latency) | AWS CloudWatch, `server/src/aws/` |

### Required Controls

| Control | Requirement |
|---|---|
| **Encryption at rest** | Internal data does not require column-level encryption. Database-level encryption (RDS storage encryption) provides a baseline. |
| **Encryption in transit** | TLS 1.2+ required for all API and dashboard endpoints. |
| **Access control** | Token usage admin endpoint (`GET /llm/token-usage`) is restricted to `isAdmin = true` users. CloudWatch log access is restricted to authorised AWS IAM roles. |
| **Logging** | Internal data may appear in operational logs. Log entries must not include any personal identifiers or decrypted email content. |
| **Sharing / third-party** | Usage analytics may be sent to PostHog (anonymised). AWS CloudWatch metrics are retained within the BearlyMail AWS account. |
| **Retention** | CloudWatch logs: 90 days. Token usage records: deleted with the user account. Analytics events: governed by PostHog data processing agreement. |
| **Incident response** | Loss or exposure of Internal data does not trigger GDPR breach notification obligations unless it can be correlated with personal data. Investigate and remediate within 5 business days. |

---

## Tier 4 — Public

### Definition

Data intentionally available to anyone without authentication.  No access controls are required beyond standard web application protections (rate limiting, TLS).

### Examples

| Data | Location |
|---|---|
| Landing page content | `client/src/pages/Landing.tsx` |
| Public documentation (README, QUICKSTART) | `README.md`, `QUICKSTART.md` |
| Open API health endpoint | `GET /health` |
| Waitlist signup form (submits email, then immediately hashed) | `client/src/pages/Landing.tsx` → `POST /waitlist` |

### Required Controls

| Control | Requirement |
|---|---|
| **Encryption at rest** | Not required. |
| **Encryption in transit** | TLS recommended; enforced via CloudFront HTTPS redirect. |
| **Access control** | No authentication required. Rate limiting via CloudFront / ALB applies. |
| **Logging** | Standard web access logs. |
| **Incident response** | Defacement or availability issues: restore from CDN / S3 source within 4 hours. |

---

## Codebase Mapping Summary

### Encryption helpers

| File | Purpose |
|---|---|
| [`server/src/encryption/encryption.helper.ts`](../server/src/encryption/encryption.helper.ts) | Core AES-256-GCM encrypt/decrypt + TypeORM transformers (`encryptedColumnTransformer`, `encryptedJsonTransformer`, `globalEncryptedColumnTransformer`, etc.) |
| [`server/src/encryption/encryption-key-provider.ts`](../server/src/encryption/encryption-key-provider.ts) | Key management: derives AES key from `ENCRYPTION_KEY` env var; serves per-user KMS data key via AsyncLocalStorage when KMS is enabled |
| [`server/src/encryption/kms-encryption.service.ts`](../server/src/encryption/kms-encryption.service.ts) | AWS KMS wrapper for envelope encryption (opt-in via `KMS_KEY_ID`); generates and decrypts per-user AES-256 data keys |
| [`server/src/encryption/user-encryption.interceptor.ts`](../server/src/encryption/user-encryption.interceptor.ts) | NestJS interceptor that loads the per-user KMS data key into AsyncLocalStorage for the duration of each request |
| [`server/src/encryption/data-reencryption/`](../server/src/encryption/data-reencryption/) | Background job for re-encrypting existing rows under a new key (key rotation) |
| [`server/src/encryption/encryption-boot-check.ts`](../server/src/encryption/encryption-boot-check.ts) | Boot-time check that fails fast if `ENCRYPTION_KEY` is absent or too short |

### Entity-to-tier mapping

| Entity / Table | Tier | Notes |
|---|---|---|
| `User.email`, `User.name`, `User.displayName`, `User.jobTitle` | Confidential | Encrypted with global key (`globalEncryptedColumnTransformer`) |
| `User.openAiApiKey`, `User.anthropicApiKey`, `User.githubToken` | Restricted | Encrypted with global key |
| `User.googleCalendarAccessToken`, `User.googleCalendarRefreshToken` | Restricted | Encrypted with global key |
| `User.totpSecret` | Restricted | Encrypted with global key |
| `User.password`, `User.passwordResetToken` | Restricted | bcrypt-hashed; not reversibly encrypted |
| `User.toneSettings`, `User.autoResponderSettings`, `User.emailSignature` | Confidential | Encrypted JSON with global key |
| `GoogleAccount.accessToken`, `GoogleAccount.refreshToken` | Restricted | Encrypted with per-user key |
| `Office365Account.accessToken`, `Office365Account.refreshToken` | Restricted | Encrypted with per-user key |
| `ZohoAccount.accessToken`, `ZohoAccount.refreshToken` | Restricted | Encrypted with per-user key |
| `Email.from`, `Email.to`, `Email.cc`, `Email.subject`, `Email.body`, `Email.htmlBody` | Confidential | Encrypted with per-user key |
| `Email.summary`, `Email.attachments`, `Email.labels` | Confidential | Encrypted with per-user key |
| `EmailThread.priorityExplanation`, `EmailThread.urgencyExplanation`, `EmailThread.categoryExplanation` | Confidential | Encrypted with per-user key |
| `EmailThread.githubMetadata`, `EmailThread.meetingProposal` | Confidential | Encrypted JSON with per-user key |
| `PrivateNote.content` | Confidential | Encrypted with per-user key |
| `UserContext.contextValue` | Confidential | Encrypted with per-user key |
| `TokenUsage` | Internal | Counts only; no PII |
| `ContextAnalysis` (progress %) | Internal | No content stored |
| `SyncHistoryLog` | Internal | Timestamps and counts; no email content |
| `Waitlist.emailHash` | Internal | SHA-256 hash; not reversible |

---

## Logging and Audit Standards

1. **Never log Restricted or Confidential data.** This includes email content, OAuth tokens, encryption keys, user names, or email addresses.
2. Application logs may contain: HTTP method, path pattern (not query params that include PII), response status code, duration, user UUID (not email address).
3. Slow-query logs record the SQL template only, not bound parameter values.
4. PostHog events are anonymised and must not include email addresses or message content.
5. LLM API requests are not logged beyond token counts and operation type.

---

## Third-Party Data Transmission

| Third Party | Data Transmitted | Tier | Safeguard |
|---|---|---|---|
| Google (Gmail API) | OAuth tokens, email content for send/sync | Restricted / Confidential | HTTPS; scoped OAuth; tokens encrypted at rest |
| Microsoft (Graph API) | OAuth tokens, email content for send/sync | Restricted / Confidential | HTTPS; scoped OAuth; tokens encrypted at rest |
| Zoho (Mail API) | OAuth tokens, email content for send/sync | Restricted / Confidential | HTTPS; scoped OAuth; tokens encrypted at rest |
| OpenAI | Email content for LLM operations (PII redacted where enabled) | Confidential | HTTPS; DPA in place; PII redaction service |
| Google Gemini | Email content for LLM operations (PII redacted where enabled) | Confidential | HTTPS; DPA in place; PII redaction service |
| RevenueCat | Subscription status (no email content) | Internal | HTTPS; RevenueCat user ID only |
| PostHog | Anonymised feature usage events | Internal | HTTPS; no PII policy enforced in client |
| AWS (RDS, ECS, KMS, S3, CloudFront) | All data (infrastructure provider) | All tiers | AWS DPA; data residency in `ap-southeast-2`; IAM least-privilege |

---

## Incident Response by Tier

| Tier | Detection Target | Containment | Notification |
|---|---|---|---|
| **Restricted** | < 1 hour | Immediate key rotation, force re-login, revoke compromised tokens | Users within 72 h (GDPR Art. 33); DPA within 72 h |
| **Confidential** | < 4 hours | Session invalidation, audit log review, patch deployment | Users within 72 h if personal data confirmed exposed (GDPR Art. 33/34) |
| **Internal** | < 24 hours | Remediate root cause, restrict access if needed | Internal notification; no regulatory obligation unless linked to personal data |
| **Public** | < 4 hours | CDN rollback or content correction | Public advisory if defacement is sustained |

---

## Review Cadence

This policy is reviewed annually (next review: **2027-05-07**) or immediately following:

- A security incident affecting any Restricted or Confidential tier data.
- Introduction of a new data category or third-party integration.
- Significant changes to the encryption architecture.
- Regulatory or compliance requirement changes.

**Sign-off required**: Senior engineer or founder must approve each revision by adding their name and date to the revision history below.

---

## Revision History

| Date | Author | Summary |
|---|---|---|
| 2026-05-07 | BearlyMail Security Team | Initial version — formalises existing de-facto classification tiers (SAQ Q4 / GAP-14) |

---

## Related Documents

- [Data Retention Policy](data-retention-policy.md)
- [Disaster Recovery Runbook](disaster-recovery-runbook.md)
- [CLAUDE.md — Encryption at Rest pattern](../CLAUDE.md)
- [`server/src/encryption/`](../server/src/encryption/) — encryption helper source
