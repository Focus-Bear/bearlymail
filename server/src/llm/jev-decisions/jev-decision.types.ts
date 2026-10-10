import type { JEV_DECISION_KINDS } from "../../constants/jev.constants";
import type { JevAnswer, JevQuestion } from "../jev-system-one";

export interface JevDecisionOutcome {
  /** Value serialised into the exact JSON contract the caller already parses. */
  output: unknown;
  /** True when the contract needs generated text or extraction Jev cannot give. */
  generationRequired: boolean;
  /** Answers that shaped `output`; only these are confidence-gated. */
  usedKeys: string[];
}

export interface JevDecisionDefinition<Input> {
  /** Lowest per-answer confidence (Jev's documented scale) accepted without fallback. */
  minConfidence: number;
  questions(input: Input): Record<string, JevQuestion>;
  compose(input: Input, answers: Record<string, JevAnswer>): JevDecisionOutcome;
}

type NoInput = Record<string, never>;

export interface McpToolCandidate {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, { type?: unknown }> };
}

export interface JevDecisionInputs {
  [JEV_DECISION_KINDS.WORKFLOW_CONDITION]: NoInput;
  [JEV_DECISION_KINDS.DISTRACTION_PHRASE]: NoInput;
  [JEV_DECISION_KINDS.MCP_SENDER_TOOL]: { tools: McpToolCandidate[] };
  [JEV_DECISION_KINDS.MERGE_DUPLICATE_CATEGORIES]: {
    categories: { name: string; description: string }[];
  };
  /** Candidate names in the order the prompt numbers them (1-based). */
  [JEV_DECISION_KINDS.CATEGORY_DUPLICATE]: { candidateNames: string[] };
  [JEV_DECISION_KINDS.INCREMENTAL_PRIORITY]: NoInput;
  [JEV_DECISION_KINDS.CONTACT_TYPE]: NoInput;
  [JEV_DECISION_KINDS.EMAIL_TYPE]: NoInput;
  [JEV_DECISION_KINDS.CUSTOM_EXCLUSION_RULES]: { rules: string[] };
  [JEV_DECISION_KINDS.PHISHING_CLEARANCE]: NoInput;
}

export type JevDecisionKind = keyof JevDecisionInputs;

/** Attached to an LLM request so the core service can try Jev first. */
export type JevDecisionRequest = {
  [Kind in JevDecisionKind]: { kind: Kind; input: JevDecisionInputs[Kind] };
}[JevDecisionKind];

export type JevDecisionRegistry = {
  [Kind in JevDecisionKind]: JevDecisionDefinition<JevDecisionInputs[Kind]>;
};
