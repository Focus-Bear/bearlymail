# Plan: Fix Phishing False Positives — Trusted Domain Allowlist

## Problem

Emails from `focusbear.io` containing links to well-known services (e.g. `docs.google.com`, `github.com`) are flagged as phishing with reason "Sender domain does not match link domains". This is a false positive.

PR #1292 (fix #744) correctly addressed DB persistence of LLM verdicts but did NOT fix the underlying heuristic that generates misleading signals.

## Root Cause

**File:** `server/src/summarization/phishing-detection.service.ts`
**Function:** `hasDomainMismatch()` (line ~110)

The function compares sender domain against ALL link domains in the email body. If none match, it returns `true`. There is **no concept of trusted/well-known domains** that should be excluded from this check.

For a `focusbear.io` sender linking to `docs.google.com` and `github.com`:
1. `hasDomainMismatch()` → `true` (no link domain matches `focusbear.io`)
2. Domain mismatch weight = 3 → `medium` confidence
3. Signal passed to LLM: `"Domain mismatch detected: true"` — biases LLM toward phishing
4. **Fallback path** (LLM failure): keyword signal used directly → guaranteed false positive
5. Client: `shouldShowPhishingAlert('medium')` → `true` → warning banner shown

## Fix (1 file, ~15 lines changed)

### `server/src/summarization/phishing-detection.service.ts`

**Add trusted domain allowlist** (after line ~14, before `hasDomainMismatch()`):

```typescript
/**
 * Well-known domains that are commonly linked in legitimate emails.
 * These are excluded from domain-mismatch checks because nearly every
 * business email links to at least one of these services.
 */
const TRUSTED_LINK_DOMAINS = new Set([
  'google.com',
  'youtube.com',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'microsoft.com',
  'apple.com',
  'amazon.com',
  'zoom.us',
  'slack.com',
  'notion.so',
  'figma.com',
  'dropbox.com',
  'atlassian.com',
  'jira.com',
  'confluence.com',
  'trello.com',
  'hubspot.com',
  'mailchimp.com',
  'sendgrid.net',
  'stripe.com',
  'intercom.io',
  'calendly.com',
  'loom.com',
  'miro.com',
  'canva.com',
  'airtable.com',
  'typeform.com',
  'surveymonkey.com',
  'docusign.com',
  'cloudflare.com',
  'amazonaws.com',
  'googleapis.com',
  'gstatic.com',
  'googleusercontent.com',
  'wp.com',
  'wordpress.com',
  'medium.com',
  'substack.com',
]);
```

**Modify `hasDomainMismatch()`** to filter out trusted domains before comparing:

```typescript
function hasDomainMismatch(
  senderDomain: string,
  bodyDomains: Set<string>,
): boolean {
  if (bodyDomains.size === 0) return false;

  const registeredDomain = (host: string) =>
    host.split('.').slice(REGISTERED_DOMAIN_PARTS).join('.');

  const senderRegistered = registeredDomain(senderDomain);

  // Filter out trusted/well-known domains before checking for mismatches
  const untrustedDomains = [...bodyDomains].filter(
    (domain) => !TRUSTED_LINK_DOMAINS.has(registeredDomain(domain)),
  );

  // If all domains are trusted, there's no mismatch to report
  if (untrustedDomains.length === 0) return false;

  for (const domain of untrustedDomains) {
    if (registeredDomain(domain) === senderRegistered) {
      return false;
    }
  }
  return true;
}
```

### Test updates

**File:** `server/src/summarization/phishing-detection.service.spec.ts` (or create if not exists)

Add test cases:
1. `focusbear.io` sender + `docs.google.com` link → `hasDomainMismatch` = `false`
2. `focusbear.io` sender + `evil-phishing.com` link → `hasDomainMismatch` = `true`
3. `focusbear.io` sender + mix of trusted + untrusted links → checks only untrusted
4. `focusbear.io` sender + only trusted links → `false`

## Why This Fix Is Minimal & Safe

- **Single file change** — only `phishing-detection.service.ts`
- **No LLM prompt changes** — the prompt already says "domain mismatch alone does NOT mean phishing", but the signal still biases the LLM
- **Fixes both paths** — normal LLM path (removes misleading signal) AND fallback path (removes false keyword verdict)
- **No client changes** — the `shouldShowPhishingAlert()` threshold logic is correct; the problem is upstream
- **Backward compatible** — emails with genuinely suspicious domain mismatches still get flagged

## Not In Scope

- Confidence threshold changes (current medium/high threshold in client is correct)
- LLM prompt rewording (already has good guidance, just receiving bad signals)
- DB migration (PR #1292's migration already cleared pre-LLM false positives)
