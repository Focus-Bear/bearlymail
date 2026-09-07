/**
 * Classify a batch processing error into a named category for metrics.
 */
export function classifyBatchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("rate limit") || message.includes("429"))
    return "rate_limit";
  if (message.includes("timeout") || message.includes("ETIMEDOUT"))
    return "timeout";
  if (message.includes("token") && message.includes("limit"))
    return "token_limit";
  if (message.includes("parse") || message.includes("JSON"))
    return "parse_error";
  if (message.includes("ECONNREFUSED") || message.includes("ENOTFOUND"))
    return "network_error";
  return "unknown";
}
