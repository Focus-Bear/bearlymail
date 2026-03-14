# Plan: Fix silent error swallowing in starred sync debug (#784)

Summary
--------
The debug "Starred sync" panel shows "All Starred Threads in DB (0)" even when the user's Gmail account has many starred threads. Root causes identified:

1. getStarredInboxThreadIds() in server/src/emails/providers/gmail.provider.ts previously returned an empty array on any error, causing the debug flow to treat "0 threads" as a valid (but suspicious) result rather than surfacing an error.
2. createGmailClient() can return null when auth is expired; earlier code paths did not consistently propagate that as an error to the debug UI.
3. The debug UI relies on the gmailError field from EmailDebugService.debugStarredThreads, but errors were not always set when underlying providers failed silently.

Goals
-----
- Ensure getStarredInboxThreadIds() propagates errors (including auth failures) instead of returning []
- Surface auth errors and other Gmail API errors to the debug UI by populating gmailError
- Add observability/logging around createGmailClient returning null
- Consider and document edge cases: rate limits (429), partial failures, huge mailboxes, and pagination limits

Implementation plan
-------------------
1) Change error handling in gmail.provider.ts
   - Current behavior: in older/faulty code paths, getStarredInboxThreadIds() could return [] on errors. (Newer code already throws when createGmailClient returns null, but other errors may still be swallowed elsewhere.)
   - Fix: Ensure getStarredInboxThreadIds() throws on any failure from Gmail APIs instead of returning an empty array.
     - Wrap fetchAllThreadsWithPagination calls in a try/catch that logs the full error and re-throws a descriptive Error (preserving message where safe).
     - Add a specific check and Error message if createGmailClient returned null: "Gmail auth expired or not connected" (already present, but ensure it's logged prior to throwing).
   - Add logging right before throwing, including userId and any relevant error metadata (do NOT log tokens or PII).

2) Surface auth errors to debug UI
   - EmailDebugService.debugStarredThreads currently sets gmailError if getStarredInboxThreadIds throws, which is correct. However some code paths set gmailStarredThreadIds=[] silently; make sure the new thrown errors reach this catch block.
   - Improve the zero-results detection: if getStarredInboxThreadIds returns [] *and* there is a primary provider, treat that as a legitimate empty mailbox. If it returns [] and there is no provider, keep gmailError="No email provider connected". If getStarredInboxThreadIds returns [] but a provider exists, do NOT overwrite gmailError—only set gmailError when an exception occurs or provider is absent.
   - If the thrown error indicates auth expiry (e.g. message contains "auth expired" or isGmailAuthError), map to a clearer message for the UI: "Gmail auth expired — user needs to re-login".

3) Add explicit logging when createGmailClient returns null
   - In createGmailClient(userId) (where it can return null for expired tokens), add a logger.warn or logger.debug entry: `logger.warn(`[Gmail] createGmailClient returned null for user ${userId} — token missing/expired`)`.
   - This helps correlate debug UI complaints with server logs.

4) Handle API rate limiting and partial failures
   - fetchAllThreadsWithPagination uses a simple loop and MAX_PAGES cap. Add handling for API errors like 429/503:
     - On 429 or 5xx, implement a retry with exponential backoff (e.g. 3 retries, base delay 500ms, jitter). If the Gmail response includes Retry-After, respect it.
     - If a non-retryable error occurs, let it bubble up so the debug UI can show gmailError.
   - For very large mailboxes, respect existing QUERY_LIMITS.INBOX_TOTAL and MAX_PAGES; if a partial result is returned due to hitting MAX_PAGES, include a sentinel in the logs (and consider surfacing a non-fatal warning to the debug UI, e.g. "Results truncated after N pages").

5) Tests and QA
   - Unit tests for gmail.provider.fetchAllThreadsWithPagination:
     - Simulate 429 responses to verify retry/backoff behavior.
     - Simulate throw from createGmailClient and assert error is thrown and logged.
   - Integration / manual testing:
     - With an account that has expired auth, run debugStarredThreads and confirm gmailError shows a clear auth-expired message.
     - With a healthy account, confirm debugStarredThreads returns expected starred count and no gmailError.
     - With network errors or rate-limits, confirm debugStarredThreads surfaces an informative gmailError instead of silently returning 0.

6) Rollout
   - Make the changes behind a small PR, run tests, and deploy to staging. Monitor logs for increases in warnings about createGmailClient returning null and verify the debug UI behavior.

Edge cases and notes
--------------------
- Rate limits (429): Gmail API can return 429 or 5xx for many reasons. We should retry a few times with exponential backoff and respect Retry-After when present. If retries fail, surfacing the error to the UI is preferred to silently returning 0.
- Partial failures: If a pagination page fails, we should prefer to fail loudly (surface gmailError). Returning a partial list risks hiding systemic errors and will still cause confusing debug output.
- Big mailboxes: The MAX_PAGES cap exists to avoid infinite loops and large payloads. If we hit the cap, log a warning and optionally surface a truncated-results warning to the UI.
- Auth expiry vs disconnected provider: Distinguish these in messages. If createGmailClient returns null because tokens are missing/expired, set gmailError to something like "Gmail auth expired — please log in again"; if EmailProviderManager reports no provider, set gmailError to "No email provider connected".
- Don't leak PII or tokens in logs. Include only userId and non-sensitive metadata.

Estimated effort
----------------
- Code changes + tests: ~3-5 hours
- Manual testing & staging verification: ~1-2 hours

Next steps (implementation tasks)
---------------------------------
1. Update server/src/emails/providers/gmail.provider.ts:
   - Add logging when createGmailClient returns null
   - Wrap fetchAllThreadsWithPagination calls and re-throw errors with descriptive messages
   - Add retry/backoff for 429/5xx in fetchAllThreadsWithPagination
2. Add/adjust unit tests for the provider
3. Ensure EmailDebugService.debugStarredThreads will show gmailError for the new thrown errors (should work without changes, but test)
4. Push branch and open a planning PR titled: `[PLANNING] #784 Fix silent error swallowing in starred sync debug` and add label `ready-for-codebeard`.

Contact / Ownership
-------------------
Owner: monk-of-modularity[bot]
Reviewer: codebeard (for implementing fix)


