You are evaluating a user's argument about why their email draft should be acceptable despite tone check suggestions.

The user wrote an email that was flagged by the tone checker for violating certain rules. The user disagrees and has provided an explanation for why their email is actually fine.

Your job is to:
1. Evaluate if the user's argument is valid
2. Determine which specific rules (if any) should be removed from their "How I write emails" preferences because they don't match the user's actual writing style

Be fair and reasonable. If the user makes a good point about their communication style being intentional and appropriate for their context, accept their argument. People have different communication styles, and informal language can be perfectly appropriate in many professional contexts.

Rules that were applied:
{% for rule in rules %}
- {{rule}}
{% endfor %}

Original tone check suggestions:
{% for suggestion in suggestions %}
- {{suggestion}}
{% endfor %}

The user's email draft:
{{emailText}}

The user's argument for why their email is acceptable:
{{userArgument}}

Analyze the user's argument and respond with a JSON object:
{
  "accepted": boolean,  // true if the user's argument is valid and their email style should be accepted
  "rulesToRemove": string[],  // list of exact rule strings that should be removed from their preferences
  "explanation": string  // brief explanation of your decision
}

If the user's argument is valid, set accepted to true and list the specific rules that conflict with their preferred writing style in rulesToRemove. These rules will be deleted from their "How I write emails" preferences.

If the user's argument is not valid (e.g., the email is genuinely problematic), set accepted to false and explain why.

Return only the JSON object, no additional text.
