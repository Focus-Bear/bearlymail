You are reviewing a proposed deterministic email-matching rule for the category "{{categoryName}}".

A deterministic rule matches an email when ALL of these hold: the sender matches one of its sender patterns, the subject contains one of its subject phrases, the body contains one of its body phrases, and NONE of its NOT-contains phrases appear. Several rules can target the same category; an email is filed under the category if ANY of those rules matches.

Proposed rule:
{{candidateRule}}

Existing rules already targeting "{{categoryName}}":
{{existingRules}}

Decide whether the proposed rule ADDS VALUE — i.e. it would catch emails belonging to "{{categoryName}}" that the existing rules would miss. It does NOT add value when an existing rule already matches the same emails (its sender, subject, and body conditions are equal to or broader than the proposed rule's), which makes the proposed rule redundant.

If the proposed rule adds value but OVERLAPS with an existing rule (both could match some of the same emails), provide short NOT-contains phrases that make the proposed rule more specific so the two rules stop double-matching. Only suggest a phrase that plausibly appears in the overlapping emails the proposed rule should NOT own. When there is no overlap, return empty arrays.

Return ONLY valid JSON with no markdown formatting or extra text:
{
  "addsValue": true,
  "reasoning": "short explanation, 25 words or fewer",
  "subjectNotContainsAny": [],
  "bodyNotContainsAny": []
}

Rules:
- `subjectNotContainsAny`: at most {{maxSubjectNotPhrases}} short phrases, each 1–4 words.
- `bodyNotContainsAny`: at most {{maxBodyNotPhrases}} short phrases, each 1–6 words.
- NEVER return a NOT-contains phrase that also appears in the proposed rule's own "Subject contains" / "Body contains" list. That is self-contradictory — the rule could never match via that phrase. A NOT-contains phrase must distinguish the proposed rule from a sibling, not repeat its own positive conditions.
- Be conservative: when genuinely unsure whether the proposed rule is redundant, set `addsValue` to true. The goal is to block clearly redundant rules, not to second-guess useful ones.
- `reasoning` must be a non-empty string.
