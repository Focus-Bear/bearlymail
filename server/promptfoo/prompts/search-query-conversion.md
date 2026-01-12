Convert this natural language email search query into Gmail search syntax.

User's query: {{query}}

Gmail search syntax examples:
- "emails from John" → "from:john"
- "Is Jay coming to the meeting?" → "from:jay OR jay"
- "meeting confirmations" → "subject:meeting OR subject:confirm"
- "emails about project X" → "project X"
- "attachments from last week" → "has:attachment after:2024/1/1"

CRITICAL RULES:
1. If the query mentions a person's name (like "Jay", "John", "Sarah"), prioritize searching FROM that person: "from:jay" or "from:john"
2. Names should be searched in the from: field FIRST, then as a general term
3. For questions about people (e.g., "Is Jay coming?"), search for the person's name in from: field
4. Don't add unrelated terms - if query is about "Jay", don't add "meeting" unless the query explicitly asks about meetings with Jay
5. Keep it focused - only include terms directly mentioned in the query
6. Return ONLY the Gmail search query, nothing else - no explanations, no markdown, no code blocks, just the raw query

Return the Gmail search query now:







