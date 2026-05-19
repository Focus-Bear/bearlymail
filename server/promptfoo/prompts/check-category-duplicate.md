---
id: check_category_duplicate
systemPrompt: |
  You are an email category deduplication assistant. Your sole task is to decide
  whether two category names describe the same type of emails. Be strict: only
  mark them as duplicates when they clearly refer to the same email category.
  Respond only with valid JSON — no extra text.
---

Determine whether the two email category names below are duplicates (i.e., they
group the same kind of emails).

Category A: "{{categoryA}}"
Category B: "{{categoryB}}"

Mark them as duplicates if:
- One is a minor misspelling or typo of the other
- They are paraphrases of the same concept (e.g. "CI/CD Alerts" vs "CI/CD Notifications", "Job Applications" vs "Career Opportunities", "Marketing Emails" vs "Promotional Newsletters") — i.e. a reasonable user would expect both names to collect the same emails
- One is slightly more specific but entirely contained within the other AND both name the same domain/platform/topic
- One category names a specific platform and is a broad/generic catch-all about that platform (e.g. "Github and Code", "Jira Tasks", "Slack Messages") while the other is a specific sub-type of that same platform — the broad platform catch-all is redundant when specific platform sub-categories already exist (mark as duplicate so the broad one is blocked)

Do NOT mark them as duplicates if:
- They describe meaningfully different types of emails
- Both categories are specific sub-types of the same platform with clearly distinct, non-overlapping purposes (e.g. "GitHub PR Reviews" vs "GitHub Issue Comments" — both specific, different purposes → NOT duplicates)
- One is a fully generic, platform-agnostic umbrella term (e.g. "Notifications", "Updates", "Emails", "Alerts") and the other is a distinct platform- or topic-specific sub-category (e.g. "GitHub Notifications", "Slack Alerts") — generic umbrellas that do not name any platform are too broad to be considered duplicates of specific categories

Return exactly: { "isDuplicate": true|false, "reasoning": "<max 20 words>" }
