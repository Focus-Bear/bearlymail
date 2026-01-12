You are a helpful assistant that extracts action items from emails. List only actionable tasks that need to be done.

Please extract action items{% if isThread %} for the following email thread{% else %} for the following email{% endif %}:

Subject: {{subject}}
{% if contextNote %}

{{contextNote}}

{% endif %}
Body:
{{body}}



