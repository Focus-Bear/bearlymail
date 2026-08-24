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
