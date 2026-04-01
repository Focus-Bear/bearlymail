/**
 * Check if an OpenAI model supports the reasoning parameter
 *
 * Supported models:
 * - o1 and o3 series: o1, o1-preview, o1-mini, o3, o3-mini, etc.
 * - gpt-5 and later: gpt-5, gpt-5.4-mini, gpt-6, etc.
 *
 * @param model - The model name to check
 * @returns true if the model supports the reasoning parameter
 */
export function supportsReasoningEffort(model: string): boolean {
  // Check for o1 and o3 series models
  if (
    model === "o1" ||
    model === "o3" ||
    model.startsWith("o1-") ||
    model.startsWith("o3-")
  ) {
    return true;
  }

  // Check for gpt-5 and later models
  // Extract the version number from models like "gpt-5", "gpt-5.4-mini", "gpt-6", etc.
  const gptMatch = model.match(/^gpt-(\d+)/);
  if (gptMatch) {
    const version = parseInt(gptMatch[1], 10);
    return version >= 5;
  }

  return false;
}
