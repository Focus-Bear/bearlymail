# LLM Integration Setup Guide

This application uses Large Language Models (LLMs) to power intelligent features like email summarization, reply drafting, and prioritization. The system supports multiple LLM providers with automatic fallback.

## Supported Providers

- **Google Gemini** (Default) - Recommended for cost-effectiveness and quality
- **OpenAI GPT** - Alternative option with strong performance

## Getting API Keys

### Google Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key

### OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the API key

## Configuration

Add your API keys to `server/.env`:

```env
# LLM Configuration
LLM_PROVIDER=gemini  # or 'openai'
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_MODEL=gemini-pro  # or 'gemini-pro-vision' for multimodal
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-5-mini
OPENAI_REASONING_EFFORT=low  # 'low', 'medium', or 'high'
```

## Usage

### Default Provider

By default, the system uses Gemini. All LLM-powered features will use the default provider unless specified.

### Per-Request Provider Selection

You can specify a provider for individual requests:

**Summarization:**

```bash
curl -X POST http://localhost:3001/summarize/123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "tldr",
    "provider": "openai"
  }'
```

**Reply Drafting:**

```bash
curl -X POST http://localhost:3001/replies/draft/123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini"
  }'
```

**Meeting Reply:**

```bash
curl -X POST http://localhost:3001/calendar/meeting-reply/123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai"
  }'
```

## Features Using LLM

### 1. Email Summarization

- **TL;DR**: Concise summary of email content
- **Bullet Points**: Key points extracted as bullets
- **Action Items**: Specific tasks and requests identified
- **Sender Request**: What the sender is asking for
- **Custom**: User-defined summarization prompts

### 2. Reply Drafting

- Generates contextually appropriate replies
- Uses learned user writing style and tone
- Incorporates common phrases from user's email history
- Adapts to email content and sender relationship

### 3. Email Prioritization

- Analyzes email content for urgency
- Considers sender importance and job title
- Uses user's historical response patterns
- Automatically flags urgent emails
- Provides reasoning for priority score

### 4. Meeting Scheduling

- Generates professional meeting scheduling replies
- Formats available time slots clearly
- Handles no-availability scenarios gracefully
- Includes calendar booking links when available

## Fallback Behavior

If the selected LLM provider fails or is unavailable:

1. The system automatically tries the other provider (if configured)
2. If both fail, falls back to rule-based algorithms
3. Logs errors for debugging

## Cost Considerations

### Gemini

- Free tier: 60 requests per minute
- Paid: Very cost-effective, pay-per-use
- Best for: High-volume usage, cost-sensitive applications

### OpenAI

- Free tier: Limited credits for new accounts
- Paid: Pay-per-token pricing
- Best for: Maximum quality, specific use cases

## Monitoring

Check available providers:

```bash
curl -X GET http://localhost:3001/llm/providers \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "available": ["gemini", "openai"],
  "default": "gemini"
}
```

## Troubleshooting

### "LLM client not initialized" error

- Check that your API key is correctly set in `.env`
- Verify the API key is valid and has proper permissions
- Restart the server after adding API keys

### Fallback to rule-based systems

- Check server logs for LLM errors
- Verify API keys are valid
- Check API rate limits haven't been exceeded
- Ensure internet connectivity for API calls

### Poor quality results

- Try switching providers (Gemini vs OpenAI)
- Adjust model selection (e.g., `gpt-5-mini`)
- Review prompts in the LLM service for customization

## Advanced Configuration

### Custom Models

You can use different models by updating `.env`:

```env
GEMINI_MODEL=gemini-pro-vision  # For multimodal support
OPENAI_MODEL=gpt-5-mini
OPENAI_REASONING_EFFORT=medium  # Increase reasoning effort for better quality (higher cost)
```

### Temperature Settings

Temperature controls randomness in responses. Current settings:

- **Summarization**: 0.5 (more focused)
- **Replies**: 0.7 (balanced creativity)
- **Prioritization**: 0.3 (more consistent)

These can be adjusted in `server/src/llm/llm.service.ts`.
