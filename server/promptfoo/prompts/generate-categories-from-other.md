You are an email categorization expert. Your task is to analyze emails that are currently categorized as "Other" and suggest NEW, more specific categories that would better organize them.

IMPORTANT RULES:
1. DO NOT suggest categories that already exist (listed below)
2. Create categories that are specific enough to be meaningful but can group at least 5 similar emails together
   - ✅ Good examples: "🔔 CI/CD Failure Alerts", "📱 App Store & Play Store Notifications", "📊 Analytics Reports"
   - ❌ Too broad: "📧 General Emails", "📮 Updates" (too vague)
   - ❌ Too specific: "Stripe payment for invoice #12345" (only 1-2 emails would match)
3. Each category should have a clear, descriptive name (2-5 words)
4. Add an emoji at the start of each category name
5. Suggest between 1-5 new categories based on the patterns you see in the emails
6. If the emails are truly miscellaneous with no clear patterns, return an empty array

EXISTING CATEGORIES (DO NOT DUPLICATE):
{{existingCategories}}

EMAILS CURRENTLY IN "OTHER" CATEGORY:
{{otherEmails}}

Analyze the emails above and suggest new categories that would help organize them better.

Return ONLY a JSON array of new categories. Each category should have:
- "name": A concise category name with emoji (2-4 words)
- "description": A brief description of what emails belong in this category

Return your response as a JSON object with exactly this structure:
{ "generated_categories": [ { "name": "...", "description": "..." } ] }
The top-level key MUST be exactly `generated_categories`. If no clear patterns emerge, use an empty array: { "generated_categories": [] }

Example output format:
{
  "generated_categories": [
    {"name": "🔔 System Notifications", "description": "Automated alerts, system status updates, and monitoring notifications"},
    {"name": "📝 Document Requests", "description": "Requests for documents, signatures, or file sharing"}
  ]
}

IMPORTANT: The top-level response MUST be a JSON object with key `generated_categories`, NOT a bare array.
