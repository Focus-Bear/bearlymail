import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicKeyValidationResult {
  valid: boolean;
  error?: string;
}

const ANTHROPIC_VALIDATION_MODEL = "claude-haiku-3-5";
const ANTHROPIC_VALIDATION_MAX_TOKENS = 1;

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

/**
 * Validates an Anthropic API key or OAuth token by making a minimal inference call
 * (`claude-haiku-3-5`, max_tokens=1) to minimise cost (~$0.000001 per call).
 *
 * A 429 (rate-limit) response is treated as valid — the key exists and has billing
 * access.  401/403 are treated as invalid.
 */
export async function validateAnthropicKey(
  key: string,
): Promise<AnthropicKeyValidationResult> {
  const client = new Anthropic({ apiKey: key });
  try {
    await client.messages.create({
      model: ANTHROPIC_VALIDATION_MODEL,
      max_tokens: ANTHROPIC_VALIDATION_MAX_TOKENS,
      messages: [{ role: "user", content: "hi" }],
    });
    return { valid: true };
  } catch (err: unknown) {
    const { status } = err as { status?: number };
    if (status === HTTP_TOO_MANY_REQUESTS) {
      // Rate-limited → key is valid
      return { valid: true };
    }
    if (status === HTTP_UNAUTHORIZED) {
      return { valid: false, error: "Invalid API key or OAuth token" };
    }
    if (status === HTTP_FORBIDDEN) {
      return {
        valid: false,
        error: "Key exists but lacks inference permissions",
      };
    }
    return {
      valid: false,
      error: `Unexpected error during key validation (HTTP ${status ?? "unknown"})`,
    };
  }
}
