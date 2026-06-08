/** Stack frames belonging to the LLM plumbing — skipped when finding the caller. */
const INFRA_FRAME =
  /token-usage\.service|llm-core\.service|llm\.service|call-site\.util|node_modules|node:internal/;

const MAX_CALL_SITE_LENGTH = 200;

/**
 * Best-effort identification of the application code that issued an LLM call,
 * by walking the current stack and returning the first frame that isn't part of
 * the LLM plumbing (token-usage / llm-core / llm dispatcher) or the runtime.
 * Returns "unknown" when no application frame can be found.
 */
export function captureLlmCallSite(): string {
  const { stack } = new Error();
  if (!stack) return "unknown";
  // First line is "Error"; the rest are "    at <frame>".
  for (const raw of stack.split("\n").slice(1)) {
    const line = raw.trim();
    if (!line.startsWith("at ")) continue;
    if (INFRA_FRAME.test(line)) continue;
    return line.replace(/^at\s+/, "").slice(0, MAX_CALL_SITE_LENGTH);
  }
  return "unknown";
}
