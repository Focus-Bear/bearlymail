You are tuning an email-matching rule for the category "{{categoryName}}".

A draft rule (sender + subject + body phrases) was just evaluated against the user's recent inbox. It correctly matched some emails belonging to "{{categoryName}}" — those are TRUE POSITIVES. It also incorrectly matched some emails belonging to OTHER categories — those are FALSE POSITIVES.

Your job: identify SHORT, GENERIC phrases that appear in the false-positive emails but NOT in the true-positive emails. These will be added to the rule as `subjectNotContainsAny` / `bodyNotContainsAny` exclusions so the rule stops matching the false positives while still matching the true positives.

True-positive samples (emails the rule SHOULD continue matching):
{{truePositiveSamples}}

False-positive samples (emails the rule should STOP matching):
{{falsePositiveSamples}}

Identify:
1. **Subject exclusions** (`subjectNotContainsAny`): 1–{{maxSubjectNotPhrases}} short phrases that appear in the false-positive subjects but NOT in the true-positive subjects. Each phrase should be 1–4 words and generic enough to recur on similar future false positives.
2. **Body exclusions** (`bodyNotContainsAny`): 1–{{maxBodyNotPhrases}} short phrases that appear in the false-positive bodies but NOT in the true-positive bodies. Each phrase should be 1–6 words.

Rules:
- A phrase MUST appear in at least one false-positive sample.
- A phrase MUST NOT appear in any true-positive sample (case-insensitive). If you cannot find a phrase that satisfies both, leave the field empty rather than guessing.
- Prefer the shortest, most generic phrase that still distinguishes the two sets. Avoid copying entire sentences.
- Fewer precise phrases beat many fuzzy ones. Two good phrases is better than five mediocre ones.
- If the two sets look indistinguishable on the available text, return empty arrays — it is better to discard the rule than to add bad exclusions.

Return ONLY valid JSON with no markdown formatting or extra text:
{
  "subjectNotContainsAny": ["phrase1"],
  "bodyNotContainsAny": ["phrase1", "phrase2"]
}
