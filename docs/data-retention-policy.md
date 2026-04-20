# BearlyMail Data Retention Policy

**Effective Date**: 2026-04-16
**Last Reviewed**: 2026-04-16
**Owner**: BearlyMail Security Team

---

## Overview

BearlyMail processes personal data (email content, account information, usage patterns) on behalf of its users. This policy defines how long different categories of data are retained, how data is deleted, and how users can exercise their right to erasure under GDPR and similar regulations.

---

## Data Categories and Retention Periods

### User Account Data

| Data Type | Retention Period | Basis |
|---|---|---|
| User profile (name, email hash) | Until account deletion | Contractual necessity |
| Encrypted email content | Until account deletion | Contractual necessity |
| AI-derived context (VIP contacts, categories) | Until account deletion | Contractual necessity |
| Authentication tokens | Session lifetime (24 h) | Security |
| Password reset tokens | 1 hour | Security |
| API keys (user-supplied, encrypted) | Until user removes or account deleted | User consent |
| Inactivity tombstone (email hash + password hash only) | 90 days after account deletion | Used solely to show "data deleted" message on login; contains no PII |

### Automated Inactivity Deletion

Accounts with no recorded activity for **30 consecutive days** are automatically deleted, including all associated data. This is enforced by a daily background job (`cleanup-inactive-accounts`) that runs at 03:00 UTC.

The retention window can be adjusted via the `DATA_RETENTION_DAYS` environment variable. Administrator accounts are always excluded from automated deletion.

"Activity" is defined as any authenticated API call that triggers `updateLastActivity()` — login, inbox load, email action, settings change, etc. New accounts that have never made an authenticated API call use their `createdAt` date as the inactivity baseline.

#### What happens when an account is deleted for inactivity

1. A daily background job identifies accounts where `lastActivityAt` (or `createdAt` for new accounts) is older than 30 days.
2. All account data is deleted: emails, threads, summaries, priorities, context, linked accounts, and the user record itself.
3. A minimal tombstone record is created containing only the **SHA-256 hash** of your email address and your **bcrypt password hash** (no plaintext data). This record is used solely to show you an informative message if you try to log in again.
4. The tombstone itself is deleted after **90 days**.

No advance notification is sent before automatic deletion. To avoid deletion, log in at least once every 30 days.

### Application Logs (CloudWatch)

| Log Group | Retention |
|---|---|
| `/ecs/bearlymail/web` | 90 days |
| `/ecs/bearlymail/worker` | 90 days |
| `/ecs/bearlymail/queue-dashboard` | 90 days |
| `/ecs/bearlymail/migration` | 90 days |

Log files may contain anonymised request metadata (HTTP method, path, response code, duration). They never contain email content or decrypted personal data.

### Database Backups

RDS automated backups are retained for **7 days**. Point-in-time recovery is available within that window. Deleted user data will be absent from backups taken after the deletion timestamp but may persist in backups taken before deletion until those backups expire.

---

## User-Initiated Deletion (Right to Erasure)

Users may request immediate deletion of their account and all associated data at any time via:

- **In-app**: Settings → Account → Delete Account
- **API**: `DELETE /users/me` with body `{ "confirmationText": "delete all my data" }`

Deletion is synchronous and irreversible. The following data is permanently removed:

- User profile and credentials
- All synced emails and email threads
- AI-generated summaries, priorities, and categories
- Learned context (VIP contacts, goals, categories, Q&A pairs)
- Private notes, action items, follow-ups
- Suggested replies and reply drafts
- Blocked senders and keywords
- Batch schedules and auto-responder settings
- OAuth tokens (Google, Microsoft, Zoho)
- All token-usage audit records for the user

The same tombstone mechanism described above applies to manual deletion — a minimal record (email hash + password hash only) is retained for 90 days so that if you sign up again with the same email, you will see a message explaining that your previous data was deleted per our privacy policy.

---

## Data Minimisation

BearlyMail applies the following minimisation measures:

- All sensitive fields (email addresses, message content, names) are encrypted at rest with AES-256-GCM.
- Email addresses are stored as SHA-256 hashes for identity lookups; the plaintext is only held in encrypted columns.
- LLM providers receive redacted content (names replaced with `[PERSON]`) where PII redaction is enabled.
- Only fields required for display are decrypted; body content is not decrypted during inbox-list queries.

---

## Compliance References

This policy addresses the following requirements:

| Requirement | Source |
|---|---|
| Right to erasure | GDPR Art. 17 |
| Data minimisation | GDPR Art. 5(1)(c) |
| Storage limitation | GDPR Art. 5(1)(e) |
| Accountability | GDPR Art. 5(2) |
| SAQ Q5 / GAP-5 | BearlyMail Security Remediation Plan |

---

## Contact

For data-related requests or questions, contact the BearlyMail team via the GitHub repository issues or the in-app support channel.
