import { UnauthorizedException } from "@nestjs/common";

import { MILLISECONDS } from "../constants/time-constants";

/**
 * Retry / fallback classification for LLM provider errors, shared by every
 * provider path in LLMCoreService. Decides which failures are permanent (skip
 * retries, go straight to the fallback provider), which are rate limits worth
 * waiting out on the cheap model, and how long each retry waits.
 */

export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

/**
 * Gemini returns 429 for two different conditions: a real per-minute quota
 * exceed (retryable), and prepayment credit depletion (NOT retryable — only
 * a billing top-up fixes it). The message text is the only way to tell them
 * apart from the SDK error.
 */
export function isGeminiBillingError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    status === HTTP_TOO_MANY_REQUESTS && /prepayment credits/i.test(message)
  );
}

/**
 * Errors that retries can never fix — short-circuit `retryOperation` so we
 * fall through to the provider fallback on the first failure instead of
 * burning two extra upstream calls per request.
 *  - 401/403: invalid/expired API key.
 *  - UnauthorizedException: the Anthropic path's wrapped form of the above.
 *  - Gemini billing 429: see `isGeminiBillingError`.
 */
export function isPermanentLLMError(error: unknown): boolean {
  if (error instanceof UnauthorizedException) return true;
  const status = (error as { status?: number } | null)?.status;
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return true;
  return isGeminiBillingError(error);
}

/** AWS SDK error name for Bedrock's per-minute token/request quota. */
const BEDROCK_THROTTLING_ERROR_NAME = "ThrottlingException";

/**
 * Provider rate-limit signals that clear on their own within a minute:
 * Bedrock's `ThrottlingException` ("Too many tokens, please wait before
 * trying again"), and HTTP 429 from Gemini/OpenAI (SDK `status`) or any AWS
 * SDK response (`$metadata.httpStatusCode`). Billing 429s are excluded — they
 * never clear by waiting (see `isGeminiBillingError`).
 */
export function isRateLimitError(error: unknown): boolean {
  if (isGeminiBillingError(error)) return false;
  const candidate = error as {
    status?: number;
    name?: string;
    $metadata?: { httpStatusCode?: number };
  } | null;
  return (
    candidate?.status === HTTP_TOO_MANY_REQUESTS ||
    candidate?.$metadata?.httpStatusCode === HTTP_TOO_MANY_REQUESTS ||
    candidate?.name === BEDROCK_THROTTLING_ERROR_NAME
  );
}

/** Attempts for transient failures (network blips, 5xx) before the provider fallback. */
export const LLM_RETRY_MAX_ATTEMPTS = 3;
const LLM_RETRY_BASE_DELAY_MS = MILLISECONDS.SECOND;
/**
 * Rate-limit schedule. Nova's per-minute token quota is exhausted during
 * onboarding bursts (an initial sync fans out hundreds of summary/priority
 * calls at once). The transient schedule above gives up after ~3s and the
 * outer fallback then moves the call to Gemini at ~7x the input price and
 * ~11x the output price — prod logs showed 90 such fallbacks in one day. The
 * quota refills within a minute, so waiting it out (2s, 4s, 8s, 16s, 32s —
 * about a minute worst case) keeps the call on the cheap model.
 */
export const RATE_LIMIT_RETRY_MAX_ATTEMPTS = 6;
const RATE_LIMIT_RETRY_BASE_DELAY_MS = 2 * MILLISECONDS.SECOND;

/** Exponential backoff with up to 1s of jitter; `attempt` is 1-based. */
export function computeRetryDelayMs(
  attempt: number,
  rateLimited: boolean,
): number {
  const baseDelayMs = rateLimited
    ? RATE_LIMIT_RETRY_BASE_DELAY_MS
    : LLM_RETRY_BASE_DELAY_MS;
  return (
    Math.pow(2, attempt - 1) * baseDelayMs + Math.random() * MILLISECONDS.SECOND
  );
}
