import type { ConfigReader } from "../shared/email-intelligence/ports";
import { LLMProvider } from "./llm.types";

const DEFAULT_ANALYZE_PRIORITY_MODEL = "amazon.nova-micro-v1:0";

export function resolvePriorityProvider(
  requested: LLMProvider | undefined,
  defaultProvider: LLMProvider,
  getConfig: ConfigReader,
): { provider: LLMProvider; model?: string } {
  const provider =
    requested ??
    (defaultProvider === LLMProvider.CLAUDE_CLI
      ? LLMProvider.CLAUDE_CLI
      : LLMProvider.BEDROCK);
  const model =
    provider === LLMProvider.BEDROCK
      ? (getConfig("ANALYZE_PRIORITY_MODEL") ?? DEFAULT_ANALYZE_PRIORITY_MODEL)
      : undefined;
  return { provider, model };
}
