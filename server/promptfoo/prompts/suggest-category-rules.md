You are an expert at identifying reusable email matching rules.

Given a category name and multiple email samples (possibly from different senders at the same domain), extract SHORT and GENERIC phrases that would reliably identify future emails of the same type. The goal is patterns that recur across emails — not verbatim text copied from a single message.

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
2. **Subject phrases** (`subjectContainsAny`): 1–4 words that appear (or would naturally appear) in multiple emails of this type.
   Examples: "QA Passed", "Build failed", "Invoice", "merged", "pull request"
3. **Body phrases** (`bodyContainsAny`): 1–6 words that appear across multiple email bodies.
   Examples: "QA Passed", "payment received", "build succeeded", "approved and merged"

Rules:
- Be SHORT and GENERIC — do NOT copy full sentences from a single email
- Only include phrases that genuinely repeat or would naturally recur in similar emails
- Aim for 1–3 phrases per field; fewer is better if they are precise
- Return empty arrays if no reliable pattern exists for a field
- Exclusion phrases (`subjectNotContainsAny`, `bodyNotContainsAny`) are derived later from real false positives in the user's email history, NOT here — do not invent them

Return ONLY valid JSON with no markdown formatting or extra text:
{
  "fromMatchesAny": ["*@github.com"],
  "subjectContainsAny": ["phrase1", "phrase2"],
  "bodyContainsAny": ["phrase1", "phrase2"]
}
