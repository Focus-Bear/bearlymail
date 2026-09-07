/** One scored factor in the priority breakdown shown to the user. */
export type PriorityBreakdownItem = {
  factor: string;
  value: number;
  description: string;
};

/** The four scoring dimensions, each with its score and supporting reasons. */
export type PriorityDimensions = {
  urgency: { score: number; reasons: string[] };
  goalAlignment: { score: number; reasons: string[] };
  vipContact: { score: number; reasons: string[] };
  sentiment: { score: number; type: string; reasons: string[] };
};

/** The encrypted JSON persisted on `EmailThread.priorityExplanation`. */
export type PriorityExplanationPayload = {
  score: number;
  breakdown: PriorityBreakdownItem[];
  dimensions: PriorityDimensions;
  calculatedAt: string;
};
