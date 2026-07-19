You are reviewing a proposed deterministic email-matching rule for the category "{{categoryName}}".

A deterministic rule matches an email when ALL of these hold: the sender matches one of its sender patterns, the subject contains one of its subject phrases, the body contains one of its body phrases, and NONE of its NOT-contains phrases appear. Several rules can target the same category; an email is filed under the category if ANY of those rules matches.

Proposed rule:
{{candidateRule}}

Existing rules already targeting "{{categoryName}}":
{{existingRules}}

Make TWO judgements.

1. **Does it MAKE SENSE?** A rule makes sense only when its conditions are logically consistent with what the category name says it should capture. In particular, its NOT-contains phrases must NEVER exclude terms that are CENTRAL to the category's own purpose. Examples of nonsense (set `makesSense` to false):
   - A "Bot ... updates" category whose NOT-contains lists bot names (e.g. `dependabot`, `claude`, `devin`) — that excludes the very emails it should catch.
   - A "Pull request" category that excludes "pull request".
   - Positive and negative conditions that cancel each other out so the rule can essentially never match.
   If the rule's conditions are coherent for the category, set `makesSense` to true.

2. **Does it ADD VALUE?** It adds value when it would catch emails belonging to "{{categoryName}}" that the existing rules would miss. It does NOT add value when an existing rule already matches the same emails (its sender, subject, and body conditions are equal to or broader than the proposed rule's), which makes the proposed rule redundant.

If the rule makes sense and adds value but OVERLAPS with an existing rule (both could match some of the same emails), provide short NOT-contains phrases that make the proposed rule more specific so the two rules stop double-matching. Only suggest a phrase that plausibly appears in the overlapping emails the proposed rule should NOT own, and that is NOT central to "{{categoryName}}". When there is no overlap, return empty arrays.

Return ONLY valid JSON with no markdown formatting or extra text:
{
  "makesSense": true,
  "addsValue": true,
  "reasoning": "short explanation, 25 words or fewer",
  "subjectNotContainsAny": [],
  "bodyNotContainsAny": []
}

Rules:
- `subjectNotContainsAny`: at most {{maxSubjectNotPhrases}} short phrases, each 1–4 words.
- `bodyNotContainsAny`: at most {{maxBodyNotPhrases}} short phrases, each 1–6 words.
- NEVER return a NOT-contains phrase that is central to "{{categoryName}}", and NEVER return one that also appears in the proposed rule's own "Subject contains" / "Body contains" list. Both are self-defeating — the rule could never match the emails it is meant to catch.
- A NOT-contains phrase must distinguish the proposed rule from a sibling, not repeat its own positive conditions or negate the category's purpose.
- Be conservative on redundancy: when genuinely unsure whether the rule is redundant, set `addsValue` to true. But do NOT call a logically broken rule sensible — `makesSense` must reflect real coherence.
- `reasoning` must be a non-empty string.
