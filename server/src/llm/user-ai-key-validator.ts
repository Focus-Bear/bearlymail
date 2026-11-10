import OpenAI from "openai";

import {
  USER_AI_KEY_LIMITS,
  USER_AI_PROVIDERS,
  type UserAiProviderDescriptor,
} from "../constants/user-ai-providers.constants";
import { validateAnthropicKey } from "./anthropic-key-validator";
import { isAuthFailure } from "./user-ai-routing";

export interface UserAiKeyValidationResult {
  valid: boolean;
  error?: string;
}

function checkFormat(
  descriptor: UserAiProviderDescriptor,
  key: string,
): UserAiKeyValidationResult {
  if (
    key.length < USER_AI_KEY_LIMITS.MIN_LENGTH ||
    key.length > USER_AI_KEY_LIMITS.MAX_LENGTH ||
    /\s/.test(key)
  ) {
    return {
      valid: false,
      error: `That doesn't look like a ${descriptor.displayName} API key`,
    };
  }
  if (descriptor.keyPrefix && !key.startsWith(descriptor.keyPrefix)) {
    return {
      valid: false,
      error: `${descriptor.displayName} keys start with '${descriptor.keyPrefix}'`,
    };
  }
  return { valid: true };
}

/** Listing models is free and needs only a valid key. */
async function validateOpenAiKey(
  key: string,
): Promise<UserAiKeyValidationResult> {
  try {
    await new OpenAI({ apiKey: key }).models.list();
    return { valid: true };
  } catch (error) {
    if (isAuthFailure(error)) {
      return { valid: false, error: "OpenAI rejected this API key" };
    }
    const { status } = error as { status?: number };
    return {
      valid: false,
      error: `Could not check the key with OpenAI (HTTP ${status ?? "unknown"})`,
    };
  }
}

/**
 * Checks a key before it is saved: its format always, and a live call where
 * the provider has a cheap one. TypeSafe has no free endpoint to probe, so a
 * bad TypeSafe key is caught on first use (recorded as rejected for Settings).
 */
export async function validateUserAiKey(
  descriptor: UserAiProviderDescriptor,
  key: string,
): Promise<UserAiKeyValidationResult> {
  const format = checkFormat(descriptor, key);
  if (!format.valid) return format;
  switch (descriptor.id) {
    case USER_AI_PROVIDERS.OPENAI:
      return validateOpenAiKey(key);
    case USER_AI_PROVIDERS.ANTHROPIC:
      return validateAnthropicKey(key);
    default:
      return format;
  }
}
