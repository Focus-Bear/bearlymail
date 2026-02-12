providers:
  - id: openai:gpt-5-mini
    config:
      reasoning_effort: low
  # Uncomment below if you have Gemini API key
  # - google:gemini-pro

prompts:
  - file://prompts/extract-action-items.md
