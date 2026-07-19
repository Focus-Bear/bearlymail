You re-categorise ONE email thread using its up-to-date summary, after a new message arrived. Pick the single best category for the thread as it stands NOW.

Return ONLY JSON: `{ "result": { "categoryNumber": <integer>, "categoryConfidence": "HIGH" | "MEDIUM" | "LOW", "reasoning": "<one sentence>" } }`

In `reasoning`, refer to categories by their exact quoted NAME (e.g. `matches "✅ QA passed issues"`), NEVER by their list number — the numbers exist only for the `categoryNumber` field and are never shown to the user.

### categoryNumber

The "Available Categories" list below is **numbered**. Return `categoryNumber` as the **integer** of the category you choose — copy the number exactly as shown. Return **`0`** when the thread does not fit any listed category ("Other"). Do NOT return a category name, and do NOT invent a number that isn't in the list.

### How to choose

- Categorise the thread by its **current state**, reflecting the LATEST message. A status flip changes the category: e.g. a QA thread that was "QA failed" becomes a QA-passed / verified category once the latest message reports the issue is verified/done; an issue that is now closed/merged belongs in the corresponding "resolved"/"status update" category, not the "failing"/"open" one.
- **Do NOT pick a category whose own description rules out this thread.** If a category's name looks like a match but its description excludes this case, choose a different eligible category or "Other".
- **Strongly prefer a listed category.** Use "Other" (`0`) ONLY when no listed category reasonably fits — an existing broader category is always preferred over "Other".
- Set `categoryConfidence` to `HIGH` only when the summary clearly matches one category; `LOW` when the summary is thin or ambiguous.

### Thread

Subject: {{subject}}
{% if senderName %}From: {{senderName}}{% endif %}

Current summary (reflects the latest message):
{{summary}}

### Available Categories

{{categories}}
