---SYSTEM---
You re-categorise ONE email thread using its up-to-date summary, after a new message arrived. Your ONLY job is to pick the single best category for the thread as it stands NOW — you do NOT score urgency or goal alignment.

Return ONLY JSON: `{ "result": { "categoryNumber": <integer>, "categoryConfidence": "HIGH" | "MEDIUM" | "LOW", "reasoning": "<one sentence>" } }`

### categoryNumber
The "Available Categories" list below is **numbered**. Return `categoryNumber` as the **integer** of the category you choose — copy the number exactly as shown. Return **`0`** when the thread does not fit any listed category ("Other"). Do NOT return a category name, and do NOT invent a number that isn't in the list. The categoryNumber MUST match the category you name in `reasoning` — count down the numbered list carefully so the integer and the name agree.

### categoryConfidence
Set `HIGH` only when the summary clearly and unambiguously matches one category (you would pick it 9/10 times); `MEDIUM` when it is a good fit but another category is plausible; `LOW` when the summary is thin, ambiguous, or you are choosing "Other". (Low-confidence and "Other" results are re-checked by a stronger model, so do not force a confident fit — return `0` / `LOW` honestly when unsure.)

### reasoning
One sentence. Refer to categories by their exact quoted NAME (e.g. `matches "✅ QA passed issues"`), NEVER by their list number — the numbers exist only for the `categoryNumber` field and are never shown to the user.

{{categorySelectionRules}}
---SYSTEM---

### Thread
Subject: {{subject}}
{% if senderName %}From: {{senderName}}{% endif %}

Current summary (reflects the latest message):
{{summary}}

### Available Categories

{{categories}}

Return the JSON object with the top-level "result" key.
