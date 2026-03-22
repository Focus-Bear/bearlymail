# Plan: Fix category→categoryId migration bugs (#1337)

**Issue:** https://github.com/Focus-Bear/BearlyMail/issues/1337
**Status:** Primary fix merged (PR #1338). This plan covers remaining gaps and hardening.

---

## Root Cause Analysis

### Bug 1: Category headers show encrypted ciphertext

**Root cause:** The `user_contexts.contextValue` column uses TypeORM's `encryptedColumnTransformer`, which only runs through entity-level access (`.find()`, `.save()`, etc.). Two raw SQL queries in `email-inbox.service.ts` selected `uc."contextValue" AS "categoryName"` via `.query()`, bypassing the transformer entirely and returning raw AES ciphertext.

**Affected queries (now fixed in PR #1338):**
1. **`getInboxSummary` query** (line ~97) — `this.emailThreadRepository.query(...)` joins `user_contexts` for category grouping. The ciphertext was consumed in `countRowsByCategory()` which builds the category name → count map returned to the client as accordion headers.
2. **`runInboxQuery` query** (line ~534) — `this.emailRepository.query(...)` joins `user_contexts` for per-email category display. The ciphertext was consumed in `decryptRawEmailRow()` which maps raw rows to `InboxEmail` objects.

**Fix applied (PR #1338):** Both call sites now pass `row.categoryName` through `EncryptionHelper.decrypt()` before use.

### Bug 2: "Other" category shows count but loads 0 emails

**Root cause:** The client sends `categoryIds=uncategorized` (constant `CATEGORY_KEY_UNCATEGORIZED` in `client/src/store/slices/inboxDataSlice.ts`). The server previously only checked for `"Other"` (the display name) when filtering. Since `"uncategorized" !== "Other"`, the filter excluded all null-categoryId emails.

**Affected code paths (now fixed in PR #1338):**
1. **`filterVisibleCategoriesByIds()`** (line ~328) — filters the summary categories. Now checks both `OTHER_CATEGORY_NAME` ("Other") and `UNCATEGORIZED_CATEGORY_KEY` ("uncategorized").
2. **`applyPostQueryFilters()`** (line ~590) — filters the email list for paginated inbox fetch. Same dual-check applied.

---

## Remaining Gaps (not covered by PR #1338)

### Gap 1: Other services have the same ciphertext bug

Multiple other services use query builder `.getRawMany()` or `.query()` with `contextValue`, returning ciphertext without decryption:

| File | Line(s) | Usage |
|------|---------|-------|
| `server/src/emails/email-admin.service.ts` | ~48, ~62 | `.addSelect('uc."contextValue"', "category")` in admin stats queries — category names in analytics dashboards will show ciphertext |
| `server/src/auto-responder/queue-stats.service.ts` | ~180 | `.select('uc."contextValue"', "category")` in queue statistics — auto-responder stats will show ciphertext category names |
| `server/src/priority/triage-suggestions.service.ts` | ~534 | Raw `.query()` selecting `contextValue` for all user contexts — triage context will contain ciphertext |

**Action:** Each raw query result that reads `contextValue` must be decrypted via `EncryptionHelper.decrypt()` before use or display.

### Gap 2: Test coverage for "uncategorized" synonym

The existing test file `server/src/emails/applyPostQueryFilters.spec.ts` only tests filtering with `"Other"` — it does **not** test the `"uncategorized"` synonym path. The pure-function mirror in the spec (line ~42) only checks `categoryIds.includes(CATEGORY_OTHER)`, missing the `UNCATEGORIZED_CATEGORY_KEY` check.

**Action:** Add test cases to `applyPostQueryFilters.spec.ts`:
1. Update the pure-function mirror to accept both `"Other"` and `"uncategorized"`
2. Add test: `categoryIds=["uncategorized"]` returns null-categoryId emails
3. Add test: `categoryIds=["uncategorized", "<uuid>"]` returns both

### Gap 3: No unit test for summary decryption

`countRowsByCategory()` is a private method but its decryption behavior is critical. There are no tests verifying that encrypted `categoryName` values are properly decrypted.

**Action:** Add an integration-style test (or extract the decryption logic into a testable helper) that verifies:
1. A row with encrypted `categoryName` is decrypted to the correct display name
2. A row with `null` categoryName maps to `"Other"`

---

## Implementation Checklist

### Priority 1 — Fix remaining ciphertext leaks
- [ ] `email-admin.service.ts`: Decrypt `category` field in admin stats query results
- [ ] `queue-stats.service.ts`: Decrypt `category` field in queue stats results
- [ ] `triage-suggestions.service.ts`: Decrypt `contextValue` in raw context query results

### Priority 2 — Test hardening
- [ ] Update `applyPostQueryFilters.spec.ts` pure-function mirror to include `"uncategorized"` synonym
- [ ] Add test case: `categoryIds=["uncategorized"]` filters correctly
- [ ] Add test case: mixed `["uncategorized", "<uuid>"]` filtering
- [ ] Add test for decryption of ciphertext categoryName → readable name

### Priority 3 — Defensive pattern
- [ ] Consider adding a shared helper (e.g., `decryptContextValue(raw: string | null): string | null`) to avoid repeating the `EncryptionHelper.decrypt()` + `.split(" - ")[0].trim()` pattern across services. Currently duplicated in at least 4 locations.

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/emails/email-admin.service.ts` | Decrypt `category` after `.getRawMany()` |
| `server/src/auto-responder/queue-stats.service.ts` | Decrypt `category` after `.getRawMany()` |
| `server/src/priority/triage-suggestions.service.ts` | Decrypt `contextValue` after `.query()` |
| `server/src/emails/applyPostQueryFilters.spec.ts` | Add "uncategorized" synonym tests |

---

*Plan authored by Monk of Modularity 🧘 — the code is already partly healed (PR #1338); these are the remaining meditation points.*
