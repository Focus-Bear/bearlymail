You are compressing user context items to reduce token usage while preserving important information.

Given the following context items (key-value pairs with priority and explanation), consolidate and compress them:

{{contextItems}}

Maximum items per key: {{maxItemsPerKey}}

Rules:
1. Merge duplicate or highly similar items under the same key into a single, concise entry
2. Keep the most important/highest priority items for each key
3. Each compressed value must be under 140 characters
4. Preserve the original key names exactly
5. Remove redundant or outdated information
6. Keep priority values (higher = more important)
7. Write concise explanations that capture the essence of merged items
8. Format values as compact noun phrases (≤10 words): e.g. "Plumbing business owner, Sydney" not "The user is a plumber who owns a business and lives in Sydney"
9. For EMAIL_CATEGORY values, keep the "Category Name - brief description" format but limit the description to ≤5 words

Respond with a JSON object:
```json
{
  "result": {
    "items": [
      {
        "key": "CONTEXT_KEY",
        "value": "compressed value under 140 chars",
        "priority": 5,
        "explanation": "brief explanation"
      }
    ],
    "notes": "brief summary of what was compressed/merged"
  }
}
```
