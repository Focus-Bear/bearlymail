# Promptfoo Setup Guide

## Overview

Promptfoo is used to test and validate LLM prompts for email prioritization, sentiment analysis, reply generation, and action item extraction.

## Configuration

The prompts are defined in `promptfooconfig.yaml` and are automatically loaded by the backend when running LLM operations.

## Setup

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Set up API keys** in your `.env` file:
   ```env
   # For OpenAI provider
   OPENAI_API_KEY=your-openai-api-key-here
   
   # For Gemini provider
   GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key-here
   ```

   **Note:** You only need to set the API keys for the providers you want to test. If you only have one API key, you can comment out the other provider in `promptfooconfig.yaml`.

3. **Run tests**:
   ```bash
   npm run promptfoo:test
   ```

4. **View results** in the web UI:
   ```bash
   npm run promptfoo:view
   ```

## Test Cases

The config includes test cases for:
- **analyze_priority**: Tests that VIP detection doesn't come from AI, urgency detection, and sentiment handling
- **analyze_sentiment**: Tests positive, negative, and neutral sentiment detection
- **generate_reply**: Tests reply generation
- **extract_action_items**: Tests action item extraction

## Troubleshooting

### "No candidates returned" error for Gemini
- Make sure `GOOGLE_GENERATIVE_AI_API_KEY` is set in your `.env`
- Check that the API key is valid
- The Gemini API might require a different model name - check the [Gemini API docs](https://ai.google.dev/docs)

### Tests failing
- The tests are designed to be flexible - they handle both JSON and text responses
- If a test fails, check the output in the promptfoo viewer to see what the LLM actually returned
- You can adjust the assertions in `promptfooconfig.yaml` if needed

### Config not found
- Make sure `promptfooconfig.yaml` is in the `server/` directory
- The backend code looks for it at `server/promptfooconfig.yaml`




