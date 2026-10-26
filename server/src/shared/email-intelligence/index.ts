/**
 * Public surface of the framework-free email-intelligence module: the batch
 * categorise + prioritise logic that both the NestJS worker and the
 * prioritisation Lambda run. Nothing reachable from here may import NestJS,
 * TypeORM or other server-only packages (enforced by email-intelligence.boundary.spec.ts).
 */
export { JevCategoryClient } from "../../llm/jev-category-client";
export { JevDecisionClient } from "../../llm/jev-decisions/jev-decision-client";
export type { LLMRequest } from "../../llm/llm.types";
export { LLMProvider } from "../../llm/llm.types";
export { getPrompt, renderPrompt, setPromptsLogger } from "../../llm/prompts";
export type * from "./category.types";
export type * from "./ports";
export type {
  BatchEmailInput,
  PriorityAnalyzerDeps,
  PriorityModelClient,
} from "./priority-analyzer";
export { PriorityAnalyzer } from "./priority-analyzer";
