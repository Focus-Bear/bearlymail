import { CATEGORY_DECISIONS } from "./category.decisions";
import { CLASSIFICATION_DECISIONS } from "./classification.decisions";
import type { JevDecisionRegistry } from "./jev-decision.types";
import { PRIORITY_AND_TOOL_DECISIONS } from "./priority-and-tools.decisions";
import { PRIORITY_SCORE_DECISIONS } from "./priority-score.decisions";

export const JEV_DECISION_REGISTRY: JevDecisionRegistry = {
  ...CLASSIFICATION_DECISIONS,
  ...CATEGORY_DECISIONS,
  ...PRIORITY_AND_TOOL_DECISIONS,
  ...PRIORITY_SCORE_DECISIONS,
};
