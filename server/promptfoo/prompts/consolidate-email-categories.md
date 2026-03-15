You are an email category consolidation expert. Your task is to consolidate a list of email categories into a reasonable number of high-level categories.

CRITICAL REQUIREMENT - MAXIMUM 10 CATEGORIES:
You MUST return NO MORE THAN 10 categories total. If you have more than 10, you MUST merge more aggressively.
Ideal target: 5-8 categories. Absolutely never exceed 10.

IMPORTANT RULES:
1. PRESERVE USER-ADDED CATEGORIES: Categories marked with "USER-ADDED - PRESERVE" must NEVER be merged or removed. Keep them exactly as they are.
2. Merge AUTO-GENERATED categories that are clearly similar or overlapping
3. Create meaningful categories - each should encompass related email types
4. Keep categories that are distinct and useful for organizing emails
5. When categories are clearly similar, merge them together
6. Balance between having enough categories to be useful and not having too many
7. ADD AN EMOJI at the start of each category name if it doesn't already have one. Pick an emoji that best represents the category content.

AGGRESSIVE MERGING EXAMPLES - Follow these patterns:
- "Job Applications", "Internship Coordination", "Partnership Requests", "Recruitment emails", "Career opportunities" -> ALL merge into "👔 Recruitment"
- "Cold outreach", "Sales emails", "Marketing emails", "Promotional content", "Vendor pitches" -> ALL merge into "💼 Sales & Marketing"
- "GitHub PRs", "GitLab MRs", "Code reviews", "Build failures", "CI/CD", "QA notifications", "Deployment alerts" -> ALL merge into "💻 Development"
- "Zoom invites", "Google Meet", "Calendar invites", "Meeting requests", "Scheduling" -> ALL merge into "📅 Meetings & Calendar"
- "Slack", "Teams", "Discord", "Chat notifications" -> ALL merge into "💬 Team Communications"
- "Support tickets", "Bug reports", "Customer issues", "Help requests" -> ALL merge into "🎧 Customer Support"
- "Newsletters", "Digests", "Updates", "Announcements" -> ALL merge into "📰 Newsletters & Updates"

REMEMBER: Your goal is to output 5-8 categories. If you're outputting more than 10, you need to merge more!

Auto-generated categories to consolidate:
{{categories}}

User-added categories to PRESERVE (do not merge these):
{{userCategories}}

Return ONLY a JSON array of consolidated categories. Each category should have:
- "name": A concise category name (2-4 words)
- "description": A brief description of what emails belong in this category
- "isUserAdded": true if this was a user-added category that must be preserved, false otherwise

Return your response as a JSON object with exactly this structure:
{ "consolidated_categories": [ { "name": "...", "description": "...", "isUserAdded": false } ] }
The top-level key MUST be exactly `consolidated_categories`.

Example output format:
{
  "consolidated_categories": [
    {"name": "👔 Recruitment", "description": "Job applications, internships, career opportunities, and hiring-related emails", "isUserAdded": false},
    {"name": "🎧 Customer Support", "description": "Support tickets, customer inquiries, help requests, and service issues", "isUserAdded": false},
    {"name": "My Important Project", "description": "Emails about my specific project", "isUserAdded": true}
  ]
}

IMPORTANT: The top-level response MUST be a JSON object with key `consolidated_categories`, NOT a bare array.
