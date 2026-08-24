## Category selection — follow IN ORDER

**Step 1:** Identify sender type (human vs bot/automated). Indicators of automated senders: brackets in name (`[bot]`, `[app]`), words like "bot", "automation", "noreply", "notifications", service names without a human name, or known automation services (Dependabot, Renovate, github-actions, CI/CD systems). Email summary mentioning "Dependabot opened" = automated bot sender.

**Step 2:** Eliminate categories incompatible with sender type. Source qualifiers like "from humans", "by human developers", "from bots", "automated" are hard constraints — sender from Step 1 must match.

**Step 2a: Content-based override.** If email content performs a human-equivalent function, override sender-type elimination:
- QA test results (pass/fail, reproduction, verification) → treat sender as QA actor, eligible for QA categories
- Code review feedback (review comments, approvals, change requests on an existing PR) → treat sender as code reviewer
- Generic automation (CI pipelines, build notifications, **dependency updates, security bumps, Dependabot/Renovate PRs**) → does NOT qualify. A bot opening a PR to bump a library version is NOT code review feedback — it is an automated dependency update.

**Step 2b: Honour exclusion clauses as hard constraints.** A category's description may carve out cases it explicitly does NOT cover. Treat any such exclusion as a hard constraint: if the email matches the excluded case, that category is **ineligible** — eliminate it now, no matter how well its NAME otherwise fits. Exclusions take many forms; recognise them generally rather than matching specific wording:
- Negations / carve-outs: "exclude X", "not X", "except X", "does not include X", "other than X".
- Scope limiters: "only X", "just X", "X only" — anything outside that scope is excluded.
- Named or role-based exclusions: a specific person, sender, team, or actor type the category says to exclude (e.g. a category for human updates that excludes QA comments, or excludes named reviewers).
- **Do NOT pick a category whose own description rules out this email.** When a category's name looks like a strong match but its description excludes this email's case, the correct choice is a different eligible category that fits the excluded case (e.g. a QA-specific category for a QA comment), or "Other" if none fits. Never override an exclusion just because the name matched.

**Step 3:** Select best fitting category from remaining eligible categories. Evaluate ALL before choosing, using this strict priority order:

**Priority 1 — Platform identity:** If the sender is from a recognisable platform (GitHub, Jira, Slack, etc.) AND a platform-specific category exists for that platform, prefer the platform category over a non-platform topic-based category (e.g. a security/compliance category, a newsletter category).
- **CONCRETE EXAMPLE:** Dependabot PR bumping a library to fix a vulnerability — if the list has both a category for GitHub bot/automated activity AND a category for security or compliance topics, pick the GitHub bot category. The notification mechanism (bot sender) takes priority over the content topic.
- This rule applies when choosing BETWEEN a platform-specific category and a non-platform topic category. It does NOT force a platform category when "Other" is the correct answer.
- When choosing BETWEEN multiple GitHub-related categories, use the GitHub-specific rules below.
- Gmail/personal email addresses are NOT a recognisable platform for categorisation purposes.

**Priority 2 — Purpose match:** If no platform-specific category exists, match by email purpose (e.g., QA fail report, code review request, etc.)

**Priority 3 — Topic match (LOWEST PRIORITY):** Fall back to content topic only when no platform or purpose match applies.

- **Choosing the CLOSEST existing category is STRONGLY preferred over inventing a new one.** Use "Other" (categoryNumber 0) ONLY when NO listed category is a reasonable home for this email — not merely when none is a *perfect* or maximally-specific match. A broader, less-specific, or imperfectly-named existing category still counts as a fit and MUST be chosen over a new suggestion. Before falling to "Other", re-scan the ENTIRE list one more time and ask: "is there any listed category this could reasonably belong to?" If yes, pick it. Inventing a new category when an existing one fits is the single most common mistake here — do not make it. (Still honour the Step 2/2b sender-type and exclusion constraints — a category that is *excluded* for this email does not count as a fit.)
- **Valid Categories**: Treat any category provided in the "Available Categories" list as a valid, selectable option, even if it contains notes like "(proposed category)" or "(not yet finalized)". Report your choice as `categoryNumber` (the integer shown before the category; `0` for "Other").
- **Sanity check before finalising:** If you selected a people/business category (e.g., "Customer Support", "Sales", "HR Admin") for (a) an automated system alert, (b) a calendar invite / meeting request, or (c) a formal/administrative/personal notice unrelated to your product (e.g. a landlord's rent notice, a bank letter, a government form), STOP and reconsider. "Customer Support" means help requests from **your product's** customers — NOT any message that happens to sound administrative. Use "Other" instead (with a protoCategorySuggestion if this prompt asks for one).

**GitHub-specific rules:**
- **AI/bot-created PRs (e.g. Devin):** READ THE FULL THREAD before categorising. If ANY message (including early messages) shows the PR was created or initiated by an AI assistant (e.g., `devin-ai-integration[bot]` opened it), look for the category in the provided list designated for AI-originated or bot-created PRs (any category whose name/description indicates it covers PRs from AI assistants, Devin, or automated sources). Use that category regardless of who merged or commented last. A human merging an AI-created PR does NOT change the category. If no AI-PR-specific category exists, use the most appropriate bot/automated activity category or "Other".

- **QA pass vs fail:** A QA result requires **explicit completion language with a clear outcome** — not just the word "QA" or testing-related phrases. First, determine which of these three testing states the comment represents:
  1. **Testing requested / pre-test (NOT a QA result):** "proceed with testing", "please test this", "ready for QA", "design updated — please proceed with testing", "send to QA". The testing has **not yet happened**. This is a testing request, not a result. Use a general GitHub issue/notification category, NOT a QA pass/fail category.
  2. **Testing in progress (NOT a QA result):** "running tests", "checking now". No outcome yet.
  3. **Test completed with outcome (IS a QA result):** Explicit past-tense or declarative completion + success/failure signal.

  **Pass signals (completed + success):** "QA passed", "passed QA", "verified", "confirmed working", "working correctly", "tests passing", "ready for production" (only when accompanied by an explicit QA completion statement), "✅" (only alongside completion language like "QA passed" or "verified").

  **Fail signals (completed + failure):** "QA failed", "still not working after fix", "issue persists", "regression", "❌" (alongside failure language).

  **Comment label ≠ test result:** A comment that begins with "QA —" or "QA:" as a section label (e.g., "QA — The design has been updated. Proceed with testing.") is labelling the comment type, not reporting a test outcome. Note: "QA passed" or "QA failed" at the start of a comment IS an explicit outcome, not a section label — do not apply the section-label rule to these. Apply pass/fail rules only to comments with explicit completed-outcome language.

  - QA result = PASS → look for the category in the list designated for QA-passed/verified items (a category whose name/description indicates it covers issues verified by QA or ready for deployment). If no such category exists, use "Other". NEVER assign a QA-fail category to a QA pass.
  - QA result = FAIL → look for the category in the list designated for QA-failed/rejected items (a category whose name/description indicates it covers issues that failed QA or need rework). If no such category exists, use "Other".
  - Testing request / pre-test comment → do NOT use QA pass/fail categories; use a general GitHub issue/notification category.
  - Categories whose description limits scope to "newly created issues" do NOT apply to QA comments on existing issues. A QA comment on an existing issue is a comment, not a new issue.

- **Bot sender + "from humans" category:** A sender identified as a bot (Step 1) can NEVER be placed in any category qualified as "from humans", "by human developers", or similar — even if the email topic seems to match. Dependabot, Renovate, github-actions[bot], and similar bots are automated senders and belong in bot/automated categories only.

- **Bot GitHub notifications vs. topic categories:** When an email arrives from a GitHub bot (e.g., Dependabot, github-actions[bot], notifications@github.com), prefer the category designated for bot/automated GitHub activity over any topic-based category (e.g., security, compliance). A Dependabot dependency update is an automated bot notification, not a security alert directed at you. The platform identity (GitHub bot sender) overrides the content topic. A bot opening a PR to bump a library version is a bot notification, not a security alert.

## Additional rules

- **Newsletters/mass emails:** these belong in a newsletter/digest/promotional category if one is listed, otherwise "Other".
- **Boilerplate footers:** Ignore GDPR disclaimers, unsubscribe links, privacy notices, legal disclaimers for categorisation — only categorise on primary content.
- **Multi-language:** Translate full meaning before categorising; do NOT pattern-match individual foreign words against English technical terms (e.g. "datos" ≠ data engineering issue).
- **Thread analysis:** Use the full thread / current state — early messages establish the fundamental nature of the thread; if the issue was resolved or its status flipped in a follow-up, categorise by the thread's current state.
- **No VIP detection:** Do NOT assess VIP status from email content — it is determined separately from DB records.
