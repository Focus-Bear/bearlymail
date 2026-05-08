# BearlyMail STRIDE Threat Model

**Last Reviewed:** 2026-05-07
**Review Cadence:** Annual (or after significant architectural changes)
**Author:** BearlyMail Security Review
**Status:** Active — pending senior engineer / founder sign-off

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Flow Diagrams](#2-data-flow-diagrams)
3. [Assets](#3-assets)
4. [Trust Boundaries](#4-trust-boundaries)
5. [Per-Boundary STRIDE Threat Analysis](#5-per-boundary-stride-threat-analysis)
6. [Mitigations](#6-mitigations)
7. [Residual Risks](#7-residual-risks)
8. [Review Sign-Off](#8-review-sign-off)

---

## 1. System Overview

BearlyMail is an AI-powered email client for users with ADHD. It connects to users' existing email accounts (Gmail, Office 365, Zoho Mail) via OAuth 2.0, syncs email content into an encrypted local store, and enriches it with AI-generated summaries, priority scores, and reply drafts.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  AWS Cloud (VPC)                                                        │
│                                                                         │
│  ┌──────────────┐      ┌──────────────────────────────────────────────┐ │
│  │  CloudFront  │      │  ECS Fargate (Private Subnet)                │ │
│  │  + S3        │      │  ┌─────────────────┐  ┌────────────────────┐ │ │
│  │  (Frontend)  │      │  │  Web Service    │  │  Worker Service    │ │ │
│  │  React 19    │ HTTPS│  │  NestJS API     │  │  NestJS Worker     │ │ │
│  │  TypeScript  │◄────►│  │  :3001          │  │  (Background Jobs) │ │ │
│  └──────────────┘      │  └────────┬────────┘  └─────────┬──────────┘ │ │
│                        │           │                     │            │ │
│                        │           ▼                     ▼            │ │
│                        │  ┌─────────────────────────────────────────┐ │ │
│                        │  │  RDS PostgreSQL 17 (Private Subnet)     │ │ │
│                        │  │  - Encrypted email data (AES-256-GCM)  │ │ │
│                        │  │  - OAuth tokens (encrypted)             │ │ │
│                        │  │  - PgBoss job queue                     │ │ │
│                        │  └─────────────────────────────────────────┘ │ │
│                        └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ HTTPS (OAuth + IMAP/API)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  External Services                                                      │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │  Gmail API  │  │ Microsoft     │  │  Zoho Mail │  │  LLM APIs    │ │
│  │  Google     │  │ Graph API     │  │  API       │  │  OpenAI /    │ │
│  │  Calendar   │  │ (Office 365)  │  │            │  │  Gemini      │ │
│  └─────────────┘  └───────────────┘  └────────────┘  └──────────────┘ │
│                                                                         │
│  ┌─────────────┐  ┌───────────────┐                                    │
│  │  GitHub API │  │  RevenueCat   │                                    │
│  └─────────────┘  └───────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Process Model

| Component | Runs As | Location | Description |
|-----------|---------|----------|-------------|
| React Frontend | Static files | S3 / CloudFront | User interface (TypeScript, Vite) |
| NestJS API | ECS Fargate task | Private subnet | REST API server (`main.ts`) |
| NestJS Worker | ECS Fargate task | Private subnet | Background job processor (`worker.ts`) |
| PostgreSQL 17 | RDS Managed | Private subnet | Primary data store + PgBoss queue |
| PgBoss | Library (in-process) | Worker process | PostgreSQL-backed job queue |

---

## 2. Data Flow Diagrams

### 2.1 Email Sync Flow

```
User Browser
    │
    │  (1) HTTPS request — GET /emails/inbox (JWT in Authorization header)
    ▼
NestJS API (ECS)
    │
    │  (2) Verify JWT; resolve userId
    │
    │  (3) Enqueue fetch-user-emails job in PgBoss
    ▼
PostgreSQL (RDS)
    │
    │  (4) Worker dequeues job
    ▼
NestJS Worker (ECS)
    │
    │  (5) Retrieve encrypted OAuth refresh token from DB; decrypt in memory
    │
    │  (6) Exchange refresh token → access token with email provider
    ▼
Gmail / Office365 / Zoho API
    │
    │  (7) Pull email messages (subject, body, sender, etc.) over HTTPS
    ▼
NestJS Worker (ECS)
    │
    │  (8) Encrypt email fields with AES-256-GCM key (from env)
    │
    │  (9) Write encrypted rows to emails + email_threads tables
    ▼
PostgreSQL (RDS)
    │
    │  (10) API reads encrypted rows; TypeORM transformers decrypt on read
    │
    │  (11) Return decrypted payload over HTTPS (TLS) to browser
    ▼
User Browser
```

### 2.2 Authentication Flow

```
User Browser
    │
    │  (1) GET /auth/google → redirect to Google OAuth consent screen
    ▼
Google OAuth
    │
    │  (2) User grants consent; Google redirects with auth code
    ▼
NestJS API
    │
    │  (3) Exchange auth code → access + refresh tokens (server-side)
    │
    │  (4) Encrypt and store refresh token in google_accounts table
    │
    │  (5) Issue BearlyMail JWT (HS256, JWT_SECRET)
    │
    │  (6) Return JWT to browser (stored in memory / localStorage)
    ▼
User Browser — subsequent requests include JWT in Authorization: Bearer header
```

### 2.3 LLM Data Flow (Priority / Summary / Reply Generation)

```
NestJS Worker / API
    │
    │  (1) Retrieve email from DB; decrypt fields in memory
    │
    │  (2) Strip PII (PII redaction service — redact-names.md prompt)
    │
    │  (3) Render Nunjucks prompt template with redacted content
    │
    │  (4) HTTPS POST to OpenAI or Gemini API (external)
    ▼
LLM Provider (OpenAI / Gemini)
    │
    │  (5) Return structured JSON (score, explanation, summary, etc.)
    ▼
NestJS Worker / API
    │
    │  (6) Encrypt LLM output fields; write to email_threads table
    ▼
PostgreSQL (RDS)
```

---

## 3. Assets

### 3.1 High-Value Data Assets

| Asset | Storage Location | Protection Mechanism | Sensitivity |
|-------|-----------------|----------------------|-------------|
| User email content (subject, body, sender) | RDS — `emails` table (AES-256-GCM encrypted columns) | Encryption at rest + TLS in transit | **Critical** |
| OAuth refresh tokens (Gmail / Office365 / Zoho) | RDS — `google_accounts`, `office365_accounts`, `zoho_accounts` (AES-256-GCM encrypted) | Encryption at rest; scoped token with minimal permissions | **Critical** |
| JWT signing secret (`JWT_SECRET`) | ECS environment variable | AWS Secrets Manager / SSM | **Critical** |
| User Data Keys (KMS) | Per-user AES keys stored in RDS (encrypted by KMS) | KMS envelope encryption; keys provisioned per user and cached in memory | **Critical** |
| LLM provider API keys | ECS environment variable | AWS Secrets Manager / SSM | **High** |
| User passwords | RDS — `users` table (bcrypt hash) | One-way hashing (bcrypt) | **High** |
| User PII (name, display name, job title, email address) | RDS — `users` table (AES-256-GCM encrypted) | Encryption at rest | **High** |
| Private notes | RDS — `private_notes` table | Encrypted at rest | **High** |
| AI-generated summaries and priority explanations | RDS — `email_threads` table (encrypted) | Encryption at rest | **Medium** |
| User tone settings and auto-responder config | RDS — `users` table (encrypted JSON) | Encryption at rest | **Medium** |
| User GitHub token | RDS — `users.githubToken` (AES-256-GCM encrypted) | Encryption at rest | **Medium** |
| User's own OpenAI API key | RDS — `users.openAiApiKey` (AES-256-GCM encrypted) | Encryption at rest | **Medium** |

### 3.2 System Assets

| Asset | Description | Sensitivity |
|-------|-------------|-------------|
| AWS IAM roles | Grant ECS tasks access to RDS, S3, CloudWatch | **Critical** |
| Docker container images | Stored in ECR; contain application code | **High** |
| Database schema / migrations | Defines data structure | **Medium** |
| LLM prompt templates | Business logic encoded in prompts | **Low** |

---

## 4. Trust Boundaries

| ID | Boundary | From | To | Protocol |
|----|----------|------|----|----------|
| TB-1 | Browser → CDN | User browser | CloudFront / S3 | HTTPS (TLS 1.2+) |
| TB-2 | Browser → API | User browser | NestJS API (ECS) via ALB | HTTPS (TLS 1.2+) |
| TB-3 | API → Database | NestJS API / Worker | RDS PostgreSQL | TCP (private VPC subnet) |
| TB-4 | API → Email Providers | NestJS Worker | Gmail / Office365 / Zoho APIs | HTTPS |
| TB-5 | API → LLM Providers | NestJS Worker / API | OpenAI / Gemini APIs | HTTPS |
| TB-6 | API → Job Queue | NestJS API | PgBoss (via PostgreSQL) | Internal (same DB) |
| TB-7 | Worker → Job Queue | NestJS Worker | PgBoss (via PostgreSQL) | Internal (same DB) |
| TB-8 | API → GitHub API | NestJS API | GitHub REST API | HTTPS |
| TB-9 | API → Calendar API | NestJS API | Google Calendar API | HTTPS |
| TB-10 | CI/CD → AWS | GitHub Actions | AWS (ECR, ECS, S3, RDS) | HTTPS (OIDC) |

---

## 5. Per-Boundary STRIDE Threat Analysis

STRIDE categories: **S**poofing · **T**ampering · **R**epudiation · **I**nformation Disclosure · **D**enial of Service · **E**levation of Privilege

---

### TB-2: Browser ↔ NestJS API

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB2-S1 | Spoofing | Attacker replays or forges a JWT to impersonate another user | Medium | Critical |
| TB2-S2 | Spoofing | Attacker uses a stolen valid JWT (e.g., XSS exfiltration) before expiry | Medium | Critical |
| TB2-T1 | Tampering | Attacker intercepts and modifies API request/response in transit (MITM) | Low | High |
| TB2-T2 | Tampering | Attacker modifies request body to target another user's email (IDOR) | Medium | High |
| TB2-R1 | Repudiation | No audit log of user actions (archive, star, delete) makes disputes unresolvable | Medium | Medium |
| TB2-I1 | Info Disclosure | API returns stack traces or verbose errors in production | Medium | Medium |
| TB2-I2 | Info Disclosure | Unauthenticated endpoints leak user existence (registration/login timing) | Low | Low |
| TB2-D1 | DoS | Unauthenticated endpoints (login, register) flooded to exhaust resources | Medium | Medium |
| TB2-D2 | DoS | Authenticated user enqueues excessive LLM jobs (force-check loop) | Low | Medium |
| TB2-E1 | Elevation | Non-admin user accesses admin-only endpoints (token usage, user management) | Low | High |

---

### TB-3: NestJS API / Worker ↔ RDS PostgreSQL

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB3-S1 | Spoofing | Attacker connects to RDS with compromised DB credentials | Low | Critical |
| TB3-T1 | Tampering | SQL injection via unsanitised input in raw SQL queries | Low | Critical |
| TB3-T2 | Tampering | Malicious insider modifies encrypted data at DB level, causing decryption errors | Very Low | High |
| TB3-R1 | Repudiation | No database audit log; DB-level changes are untraceable | Low | Medium |
| TB3-I1 | Info Disclosure | DB credentials exposed via misconfigured environment variables or logs | Low | Critical |
| TB3-I2 | Info Disclosure | Encrypted columns returned in raw SQL without manual decryption, served to client | Medium | High |
| TB3-D1 | DoS | Runaway query exhausts DB connection pool and starves other users | Low | High |
| TB3-E1 | Elevation | Application account holds overly broad DB privileges (e.g., DROP TABLE) | Low | High |

---

### TB-4: NestJS Worker ↔ Email Providers (Gmail / Office365 / Zoho)

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB4-S1 | Spoofing | Attacker replays stolen OAuth refresh token to access user mailbox | Low | Critical |
| TB4-S2 | Spoofing | DNS/BGP hijack redirects OAuth callback to attacker-controlled server | Very Low | Critical |
| TB4-T1 | Tampering | Attacker intercepts OAuth callback and substitutes authorization code | Very Low | Critical |
| TB4-R1 | Repudiation | Emails sent via provider on user's behalf (auto-responder, follow-ups) are difficult to attribute uniquely to BearlyMail | Low | Medium |
| TB4-I1 | Info Disclosure | OAuth tokens logged in plain text (e.g., debug logs) | Low | Critical |
| TB4-I2 | Info Disclosure | Overly broad OAuth scopes expose more mailbox data than needed | Medium | High |
| TB4-D1 | DoS | Email provider enforces rate limits; excessive syncing blocks all users sharing provider quota | Medium | Medium |
| TB4-E1 | Elevation | Compromised OAuth token allows reading/sending email as user without BearlyMail credentials | Low | Critical |

---

### TB-5: NestJS Worker / API ↔ LLM Providers (OpenAI / Gemini)

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB5-S1 | Spoofing | Attacker substitutes a malicious LLM response (adversarial model output) | Very Low | Medium |
| TB5-T1 | Tampering | Prompt injection: malicious content in email body hijacks LLM instruction | Medium | Medium |
| TB5-R1 | Repudiation | LLM provider processes data with no audit trail from BearlyMail perspective | Low | Low |
| TB5-I1 | Info Disclosure | Email content (even partially redacted) sent to external LLM provider | Medium | High |
| TB5-I2 | Info Disclosure | LLM API key exposed via logging or error messages | Low | High |
| TB5-D1 | DoS | LLM API rate limit exhausted by large batch of emails or adversarial input | Medium | Medium |
| TB5-E1 | Elevation | LLM output used directly to trigger system actions without validation | Low | High |

---

### TB-6 / TB-7: API / Worker ↔ PgBoss Job Queue

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB6-S1 | Spoofing | Rogue process connects to same DB and dequeues or injects jobs | Very Low | High |
| TB6-T1 | Tampering | Job payload modified at rest in pgboss schema to redirect jobs to wrong user context | Very Low | High |
| TB6-R1 | Repudiation | Failed jobs silently discarded with no durable error log | Low | Medium |
| TB6-I1 | Info Disclosure | Sensitive data (userId, threadId) stored in job payload in plain text in pgboss tables | Low | Medium |
| TB6-D1 | DoS | Job queue flooded with low-priority jobs, starving high-priority syncs | Low | Medium |
| TB6-E1 | Elevation | Worker processes job intended for a different user due to missing userId validation in job handler | Low | High |

---

### TB-8: API ↔ GitHub API

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB8-S1 | Spoofing | Attacker uses another user's GitHub token (if exfiltrated) | Low | Medium |
| TB8-I1 | Info Disclosure | GitHub token logged in plain text | Low | Medium |
| TB8-D1 | DoS | GitHub API rate limit exhausted by excessive metadata fetches | Low | Low |

---

### TB-9: API ↔ Google Calendar API

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB9-S1 | Spoofing | OAuth token for Calendar used without user knowledge | Low | Medium |
| TB9-I1 | Info Disclosure | Calendar event details (meetings, participants) sent to LLM for meeting reply generation | Medium | Medium |
| TB9-D1 | DoS | Calendar API quota exhausted | Low | Low |

---

### TB-10: CI/CD ↔ AWS (GitHub Actions)

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB10-S1 | Spoofing | Malicious PR triggers workflow that accesses OIDC-federated AWS credentials | Low | Critical |
| TB10-T1 | Tampering | Compromised GitHub Actions runner injects malicious code into Docker image | Very Low | Critical |
| TB10-I1 | Info Disclosure | GitHub Actions secrets (API keys, etc.) exposed via `echo` or test output | Low | High |
| TB10-E1 | Elevation | Overly permissive IAM role for GitHub Actions allows unintended AWS operations | Low | High |

---

### TB-1: Browser ↔ CloudFront / S3 (Static Frontend)

| # | STRIDE | Threat Description | Likelihood | Impact |
|---|--------|--------------------|-----------|--------|
| TB1-S1 | Spoofing | Attacker serves malicious version of frontend from compromised CDN origin | Very Low | Critical |
| TB1-T1 | Tampering | S3 bucket misconfiguration allows public write, replacing frontend assets | Very Low | Critical |
| TB1-I1 | Info Disclosure | S3 bucket publicly readable exposes frontend source maps or build artifacts | Low | Low |
| TB1-D1 | DoS | CloudFront DDoS; no WAF in front of distribution | Medium | Medium |
| TB1-E1 | Elevation | XSS in React app reads JWT from storage and exfiltrates to attacker | Low | Critical |

---

## 6. Mitigations

### 6.1 Existing Controls

| Control | Threats Mitigated | Implementation |
|---------|------------------|----------------|
| **AES-256-GCM encryption at rest** | TB3-I2, TB4-I1, TB3-T2 | TypeORM column transformers (`encryptedColumnTransformer`, `encryptedJsonTransformer`) on all sensitive fields |
| **bcrypt password hashing** | TB2-S1 | bcrypt with appropriate work factor; passwords never stored in plaintext |
| **JWT authentication (HS256)** | TB2-S1 | Signed with `JWT_SECRET`; required on all protected endpoints via `JwtAuthGuard` |
| **HTTPS / TLS in transit** | TB2-T1, TB4-I1, TB5-I2 | CloudFront enforces HTTPS; production ALB terminates TLS |
| **OAuth 2.0 for email provider tokens** | TB4-S1, TB4-E1 | Access tokens expire; refresh tokens encrypted at rest |
| **Private VPC subnet for RDS** | TB3-S1 | RDS not publicly accessible; only ECS tasks in same VPC can connect |
| **CORS restriction** | TB2-S2 | `FRONTEND_URL` env var restricts cross-origin API access |
| **Admin guard (`isAdmin`)** | TB2-E1 | Admin-only endpoints gated by `isAdmin` check on JWT principal |
| **OIDC for GitHub Actions → AWS** | TB10-S1, TB10-I1 | No static AWS credentials; short-lived OIDC tokens scoped per workflow |
| **PII redaction before LLM** | TB5-I1 | `ContextPiiRedactionService` + `redact-names.md` prompt strips names before LLM calls |
| **User data isolation** | TB6-E1, TB2-T2 | All DB queries include `userId` FK filter; entity ownership validated in service layer |
| **Environment variable secrets** | TB3-I1, TB5-I2 | API keys and encryption keys stored as ECS environment variables backed by AWS Secrets Manager |
| **TypeScript strict mode** | TB3-T1 | Reduces injection surface via type safety; parameterised queries via TypeORM |
| **`lastUserOperationAt` guard** | TB6-T1 | Prevents background sync from overriding recent user actions on email threads |

### 6.2 Partially Implemented / Planned Controls

| Control | Gap | Recommended Action |
|---------|-----|-------------------|
| **Rate limiting** | No documented rate limiting on API endpoints | Implement NestJS `ThrottlerModule` on auth endpoints (`/auth/login`, `/auth/register`) and LLM-triggering endpoints |
| **Structured audit log** | User actions (archive, star, reply send) not written to a durable audit log | Add `AuditLog` entity and log all write operations with userId, action, target, timestamp |
| **OAuth scope minimisation** | OAuth scopes not audited against minimum-required | Review Gmail / Office365 / Zoho OAuth scopes; remove any that exceed feature requirements |
| **Content Security Policy (CSP)** | CSP headers not confirmed in CloudFront configuration | Add strict CSP to mitigate XSS (TB1-E1) |
| **HttpOnly Cookies** | JWTs stored in localStorage are vulnerable to XSS | Move JWT storage to HttpOnly cookies to prevent programmatic access by malicious scripts |
| **Job payload encryption** | PgBoss job payloads (containing `userId`, `threadId`) stored in plain text in DB | Implement encryption for sensitive fields in job payloads to ensure consistent encryption at rest |
| **Database connection least privilege** | Application DB role privileges not documented | Audit and restrict application DB user to `SELECT, INSERT, UPDATE, DELETE` only; no DDL access |
| **LLM output validation** | LLM responses used in structured operations (category, priority score) without schema validation | Validate and sanitise LLM JSON responses against expected schema before acting on them |
| **WAF on CloudFront** | No WAF protecting frontend distribution | Attach AWS WAF with common rule sets to CloudFront distribution |

---

## 7. Residual Risks

These risks are **accepted** as of the last review date, with rationale:

| Risk ID | Description | Rationale for Acceptance | Owner |
|---------|-------------|--------------------------|-------|
| RR-1 | Email content shared with LLM providers (OpenAI / Gemini), including after PII redaction | Core product function; mitigated by PII redaction service; data processing agreements with providers required | Engineering |
| RR-2 | No end-to-end encryption between API and client — data decrypted in API memory before serving over TLS | E2E encryption would prevent AI feature set (summarisation, priority); TLS provides adequate in-transit protection | Engineering |
| RR-3 | JWT tokens stored in browser (localStorage or memory) are vulnerable to XSS | Application relies on React ecosystem; XSS surface mitigated by framework escaping and planned CSP; tokens expire | Engineering |
| RR-4 | LLM prompt injection via malicious email content | Risk accepted at current user scale; prompts designed with separator tokens; outputs validated by type; monitoring in place | Engineering |
| RR-5 | Encrypted data permanently inaccessible if `ENCRYPTION_KEY` is lost | Key is backed up via AWS Secrets Manager; recovery procedure documented in DR runbook | DevOps / Founder |
| RR-6 | Calendar event details (attendees, titles) sent to LLM for meeting reply generation | Core scheduling feature; user opt-in; data minimised to relevant meeting context only | Engineering |

---

## 8. Review Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Senior Engineer / Founder | *(pending)* | | |
| Security Reviewer | *(pending)* | | |

**Next Review Due:** 2027-05-07

---

## Appendix A: STRIDE Reference

| Letter | Category | Definition |
|--------|----------|------------|
| S | Spoofing | Impersonating something or someone |
| T | Tampering | Modifying data or code |
| R | Repudiation | Claiming not to have performed an action |
| I | Information Disclosure | Exposing information to unauthorised parties |
| D | Denial of Service | Denying service to legitimate users |
| E | Elevation of Privilege | Gaining capabilities without authorisation |

---

## Appendix B: Related Documents

- [Disaster Recovery Runbook](disaster-recovery-runbook.md)
- [Data Retention Policy](data-retention-policy.md)
- [DNS Audit Runbook](dns-audit-runbook.md)
