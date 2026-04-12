# Plan: Fix #1427 — Improve Email Categorisation Prompt Generically

**Branch:** `plan/1427-improve-categorisation-prompt`  
**Author:** Monk of Modularity (AI agent), subagent of Laoban  
**Priority:** P2 — miscategorisation erodes user trust in the inbox  
**Linked issue:** #1427

---

## Problem Statement

A GitHub notification email (comment on a mobile-app issue) was categorised as "Customer feedback" instead of a GitHub/developer category. Jeremy's directive: **don't fix this specific edge case — improve the prompt generically so it does a better job across the board.**

The root cause is that the categorisation prompt in `prioritise-email.md` has grown organically with domain-specific patches (Devin PRs, QA pass/fail, bot detection, newsletter scoring) but lacks **general-purpose categorisation reasoning principles**. Each time a new edge case appears, another special-case block gets added. This approach doesn't scale and leaves the prompt blind to any scenario not explicitly anticipated.

---

## Root Cause Analysis

### Current prompt structure (in `server/promptfoo/prompts/prioritise-email.md`)

The categorisation section (Steps 1–3 + special guidance) is **~120 lines** of instruction. Analysis of its weaknesses:

### Weakness 1: No "evidence extraction" step before category selection

The prompt jumps from "identify sender type" straight to "parse category names and eliminate incompatible ones". It never asks the LLM to **extract the key signals from the email first** — who sent it, what platform it came from, what the email is about, what action (if any) is expected.

**Impact:** Without explicit signal extraction, the LLM pattern-matches on surface cues. A GitHub notification about a user's bug report can look like "Customer feedback" if you focus on the content (a user describing a problem) rather than the **source** (GitHub notification system) and **format** (automated notification email).

### Weakness 2: Over-reliance on sender-name heuristics for automated detection

Step 1 identifies bots by checking for `[bot]`, `noreply`, `notifications` etc. in the sender name. But many automated emails (GitHub, Jira, Linear, Notion, Figma comments) come from sender names like `"Jeremy Nagel (via GitHub)" <notifications@github.com>` — which contain a human name. The prompt doesn't instruct the LLM to also check:

- The **email address domain** (e.g., `notifications@github.com`, `noreply@linear.app`)
- **Email headers and footer patterns** (e.g., "You are receiving this because you were mentioned", "Reply to this email directly or view it on GitHub")
- The **structural format** of the body (notification templates vs. free-form human writing)

**Impact:** Automated notifications from platforms that show the human actor's name get misidentified as human-sent emails, bypassing bot-specific routing.

### Weakness 3: No "source platform identification" step

The prompt has GitHub-specific guidance but no general principle for identifying the **source platform** of an email. Emails from Jira, Linear, Slack, Notion, Sentry, PostHog, etc. all have distinctive patterns but no guidance exists for them. The fix should be a **general principle** ("identify the originating platform/system first") rather than adding more platform-specific blocks.

### Weakness 4: Category selection favours "topic match" over "source match"

When an email is a GitHub notification about a user reporting a bug, there are two possible matches:

- **Topic match:** "Customer feedback" (someone is giving feedback about a bug)
- **Source match:** A GitHub/developer notifications category

The prompt doesn't establish a clear **hierarchy of matching signals**. Source/platform should generally outweigh topic for automated notifications, because the user set up those categories to group emails by where they come from, not what the underlying conversation is about.

### Weakness 5: The prompt has no "think step by step" structure for category reasoning

The `categoryExplanation` field asks the LLM to explain its choice, but this explanation happens **after** the choice. Research shows that asking LLMs to reason **before** committing to an answer improves accuracy. The prompt should instruct the LLM to:

1. Extract signals (sender, platform, format, topic)
2. List the top 3 candidate categories with reasoning
3. Select the best one

This is already partially done for the explanation ("Explain why you chose this category AND why the other top 2 closest categories were not chosen") but it's structured as a post-hoc justification, not a pre-selection reasoning step.

---

## Proposed Changes

### 1. Restructure the categorisation steps in `prioritise-email.md`

Replace the current Steps 1–3 with a **5-step general-purpose categorisation framework**:

```markdown
**Step 1: Extract email metadata signals.**
Before selecting a category, identify these signals from the email:

- **Source platform**: What system sent this email? Check the sender email address
  domain (e.g., notifications@github.com → GitHub, noreply@linear.app → Linear),
  notification boilerplate in the body (e.g., "View it on GitHub", "Unsubscribe from
  these notifications"), and the structural format (template vs. free-form prose).
- **Sender role**: Is the sender a human writing directly, a human acting through a
  platform (e.g., someone commenting on GitHub which triggers a notification), or a
  fully automated system (CI, monitoring, scheduled reports)?
- **Email purpose**: What is this email trying to communicate? (notification of activity,
  direct request, informational update, marketing, transactional receipt, etc.)
- **Content topic**: What is the email actually about? (code review, bug report,
  meeting, sales pitch, etc.)

**Step 2: Match against categories using signal priority.**
When selecting a category, apply signals in this priority order:

1. **Source-platform match** — If a category exists for the email's source platform
   (e.g., "GitHub notifications", "Jira tickets", "Sentry alerts"), prefer it over
   a topic-based category. Users create platform-specific categories because they
   want to group all emails from that platform together, regardless of the specific
   topic within it.
2. **Purpose/function match** — If no platform-specific category exists, match on
   the email's purpose (e.g., "Customer support" for support requests, "Sales" for
   sales outreach).
3. **Topic match** — Only if neither platform nor purpose produces a strong match,
   fall back to topic-based matching.

**Step 3: Parse category names carefully and eliminate incompatible categories.**
[Keep existing Step 2 content about exclusion criteria, source qualifiers, etc.]

**Step 3a: Content-based role override.**
[Keep existing Step 2a content]

**Step 4: Select the best fitting category** from the remaining eligible categories.
[Keep existing Step 3 content about evaluating ALL eligible categories]

**Step 5: Validate your choice.**
Before finalising, check:

- Did you consider the email's SOURCE PLATFORM? If the email is an automated
  notification from a platform (GitHub, Jira, Linear, Sentry, etc.), it should
  almost never be categorised as "Customer feedback", "Sales", or other categories
  meant for direct human-to-human communication — unless the user has explicitly
  set up those categories to include platform notifications.
- Is your category based on the email's ACTUAL purpose, or did you match on
  surface-level content similarity? (e.g., a GitHub issue about a bug is NOT
  "Customer feedback" — it's a developer notification about a bug report)
```

### 2. Remove or reduce GitHub-specific special guidance

The current "Special guidance for GitHub notifications" section (Devin PR identification, QA comments, QA pass/fail) is ~40 lines of GitHub-specific rules. With the generic framework above, much of this becomes unnecessary. However, the QA pass/fail distinction is genuinely tricky and should be kept as an **example** within the general framework rather than a standalone section.

**Action:** Move the Devin PR and QA pass/fail guidance into a condensed "Examples of applying the framework" section at the end of the categorisation block, demonstrating how the 5-step process handles these cases. This teaches the LLM the reasoning pattern rather than giving it lookup-table rules.

### 3. Add a "reasoning before selection" instruction

Change the output format to encourage the LLM to reason about categories before selecting:

```markdown
7. categoryExplanation: Think through the categorisation step by step:
   a. What platform/system sent this email? (extracted from sender domain, body format)
   b. What is the email's primary purpose? (notification, request, update, etc.)
   c. Which categories match the platform? Which match the purpose? Which match the topic?
   d. Final selection and why the alternatives were not chosen.
```

### 4. Update the promptfoo test suite

**New/updated file:** `server/promptfoo/categorize-email-batch.yaml` (or update existing test files)

Add test cases that verify the generic improvements work across different platforms and scenarios:

```yaml
tests:
  - description: "GitHub notification about an issue comment → should NOT be 'Customer feedback'"
    vars:
      from: "notifications@github.com"
      fromName: "Jeremy Nagel"
      subject: "Re: [Focus-Bear/mobile-app] Bug: app crashes on startup (#234)"
      body: |
        @jeremy commented on this issue:
        "This is happening for me too, the app crashes immediately after login."
        —
        Reply to this email directly or view it on GitHub.
        You are receiving this because you were mentioned.
      emailCategories: |
        - "Customer feedback": Feedback from customers about products or services
        - "🔔 GitHub notifications": Notifications from GitHub (issues, PRs, comments)
        - "Other"
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          const cat = (result.result || result).category;
          if (cat === 'Customer feedback') {
            throw new Error(`GitHub notification miscategorised as Customer feedback`);
          }

  - description: "Jira notification → should prefer platform category over topic"
    vars:
      from: "jira@focusbear.atlassian.net"
      fromName: "Focus Bear Jira"
      subject: "[BEAR-123] Customer reports slow loading times"
      body: |
        Alice updated BEAR-123:
        Status changed: Open → In Progress
        —
        This message was sent by Atlassian Jira.
      emailCategories: |
        - "Customer feedback": Feedback from customers
        - "📋 Jira tickets": Notifications from Jira
        - "Other"
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          const cat = (result.result || result).category;
          if (cat !== '📋 Jira tickets') {
            throw new Error(`Expected 'Jira tickets', got '${cat}'`);
          }

  - description: "Direct human email about a bug → should be 'Customer feedback' (not platform notification)"
    vars:
      from: "alice@example.com"
      fromName: "Alice Smith"
      subject: "Bug report: the app keeps crashing"
      body: |
        Hi,
        I've been experiencing crashes every time I try to open the settings page.
        This started after the latest update. Can you please look into this?
        Thanks, Alice
      emailCategories: |
        - "Customer feedback": Feedback from customers about products or services
        - "🔔 GitHub notifications": Notifications from GitHub
        - "Other"
    assert:
      - type: javascript
        value: |
          const result = JSON.parse(output);
          const cat = (result.result || result).category;
          if (cat !== 'Customer feedback') {
            throw new Error(`Expected 'Customer feedback', got '${cat}'`);
          }
```

---

## Files to Change

| File                                                         | Change                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/promptfoo/prompts/prioritise-email.md`               | Restructure Steps 1–3 → Steps 1–5 with generic signal-extraction framework; condense GitHub-specific rules into examples; update `categoryExplanation` format |
| `server/promptfoo/categorize-email-batch.yaml`               | Add/expand test cases for cross-platform categorisation accuracy                                                                                              |
| `server/promptfoo/prompts/consolidate-email-categories.md`   | No changes needed — consolidation is a separate concern                                                                                                       |
| `server/promptfoo/prompts/generate-categories-from-other.md` | No changes needed                                                                                                                                             |

**Estimated scope:** Small — primarily prompt text changes in one file, plus test cases. No TypeScript code changes required (the prompt is loaded from the .md file at runtime).

---

## Testing

1. Run `promptfoo eval` on the updated categorise tests — all new cross-platform test cases must pass
2. Run existing `promptfoo eval` on `prioritise-email-prompts.yaml` — no regressions on existing priority analysis tests
3. Manual spot-check: re-run categorisation on the specific email from issue #1427 and verify it's no longer assigned to "Customer feedback"
4. Verify batch mode (`batchMode=true` path) also gets the improved instructions (since the prompt is shared via the Jinja template)

---

## What This Does NOT Change

- The category list itself (that's user-defined)
- The priority/urgency scoring logic
- The batch vs single-email code paths (already unified in #1144's plan)
- The `canonicaliseCategoryName` logic
- Any TypeScript service code

---

## Risk Assessment

**Low risk.** This is a prompt-only change. The restructured steps are strictly additive — they add signal extraction and validation steps without removing any existing logic. The existing GitHub-specific guidance is preserved (just relocated into an examples section). If the new prompt performs worse on any edge case, it can be reverted with a single file change.

---

Closes #1427
