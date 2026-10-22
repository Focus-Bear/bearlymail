import { matchPattern } from "../summarization/pattern-matcher";
import { WorkflowCondition } from "./types/workflow.types";

/** Body characters a workflow condition is evaluated against. */
export const WORKFLOW_MAX_BODY_CHARS = 4000;

/** The email fields a workflow condition is evaluated against. */
export interface WorkflowMatchInput {
  from: string;
  subject: string;
  /** Cleaned body text, already truncated to what the engine evaluates. */
  body: string;
  category: string;
  priority: string;
}

function matchesAnyPattern(value: string, patterns: string[] | undefined) {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((pattern) => matchPattern(value, pattern));
}

function matchesAnyValue<T>(value: T, allowed: T[] | undefined): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(value);
}

/**
 * Deterministic part of a workflow condition: every non-empty pattern list must
 * match (AND across fields, OR within a field). An empty list means "any".
 *
 * Shared by the live engine (`WorkflowsService`) and by anything that simulates
 * a rule over past mail (the auto-archive proposal safeguard), so a simulation
 * can never disagree with what the engine will actually do.
 */
export function matchesWorkflowCondition(
  condition: WorkflowCondition,
  input: WorkflowMatchInput,
): boolean {
  return (
    matchesAnyPattern(input.from, condition.fromPatterns) &&
    matchesAnyPattern(input.subject, condition.subjectPatterns) &&
    matchesAnyPattern(input.body, condition.bodyPatterns) &&
    matchesAnyValue(input.category, condition.categories) &&
    matchesAnyValue(
      input.priority,
      condition.priorityLevels as string[] | undefined,
    )
  );
}
