You are an expert at identifying reusable email matching rules.

Given a category name and multiple email samples (possibly from different senders at the same domain), extract SHORT and GENERIC phrases that would reliably identify future emails of THIS category — and distinguish them from other, similar emails the same sender also sends.

Category: {{categoryName}}
Sender email addresses:
{{senderEmails}}

Email samples:
{{emailSamples}}

Identify:
1. **Sender pattern** (`fromMatchesAny`): Decide whether to match by exact address(es) or a domain wildcard.
   - If multiple sender emails all share the same domain (e.g. notifications@github.com AND actions@github.com both from @github.com), use a single wildcard: `["*@github.com"]`
   - Even with a single sender address, if it is clearly an automated notification service that is known to send from multiple addresses at the same domain (e.g. GitHub, GitLab, Jira, CircleCI, other CI/CD systems), use a domain wildcard
   - Otherwise use the exact sender email address(es)
2. **Subject phrases** (`subjectContainsAny`): 1–4 words that are DISTINCTIVE of this category — the wording that sets it apart from the sender's other emails, not generic boilerplate the sender puts on everything. Use the category name as your strongest signal for what makes this type unique.
   Examples: for "GitHub QA passed issues" → "QA Passed" (NOT generic "GitHub", "notification", "Issue #").
3. **Body phrases** (`bodyContainsAny`): 1–6 words that recur across this category's bodies AND are distinctive to it. Prefer the specific signal (e.g. "QA Passed", "payment received", "build succeeded") over generic chrome the sender adds to every email ("view it on GitHub", "unsubscribe", "left a comment").

Then identify EXCLUSIONS that keep this rule from also matching the sender's OTHER, similar email types:
4. **Subject exclusions** (`subjectNotContainsAny`): short phrases that appear in the sender's adjacent-but-different emails and would cause a false match. The category name tells you what to exclude — e.g. for "...issues" exclude "pull request"; for "passed/succeeded" exclude "failed".
5. **Body exclusions** (`bodyNotContainsAny`): same idea, for the body.

Rules:
- Be SHORT and GENERIC — do NOT copy full sentences from a single email.
- Prefer DISTINCTIVE phrases over generic sender boilerplate. A phrase that appears in EVERY email from this sender (regardless of type) is useless — omit it.
- Only include phrases that genuinely repeat or would naturally recur in similar emails.
- Aim for 1–3 phrases per positive field; fewer is better if they are precise.
- Exclusions are best-effort SUGGESTIONS for the user to review — propose them when the category name or samples imply an obvious sibling type to exclude. Return empty arrays when nothing clearly needs excluding; never invent an exclusion just to fill the field.
- Return empty arrays for any field where no reliable pattern exists.

Return ONLY valid JSON with no markdown formatting or extra text:
{
  "fromMatchesAny": ["*@github.com"],
  "subjectContainsAny": ["phrase1", "phrase2"],
  "bodyContainsAny": ["phrase1", "phrase2"],
  "subjectNotContainsAny": ["phrase1"],
  "bodyNotContainsAny": ["phrase1"]
}
