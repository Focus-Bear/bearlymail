import { assignFamily } from "../context/category-family.taxonomy";

export interface FamilyConfidence {
  family: string;
  /** Summed probability of every option in the family. */
  confidence: number;
}

/**
 * Jev's most probable category family. Taxonomies hold many near-duplicate
 * siblings, so Jev can be sure of the family while splitting probability
 * between siblings; summing each family's option probabilities measures that
 * without asking Jev a second question.
 */
export function topFamilyConfidence(
  probabilities: Record<string, number>,
  categoryNameForChoice: (choice: string) => string | null,
): FamilyConfidence | null {
  const confidenceByFamily = new Map<string, number>();
  for (const [choice, probability] of Object.entries(probabilities)) {
    const categoryName = categoryNameForChoice(choice);
    if (!categoryName) continue;
    const family = assignFamily(categoryName);
    confidenceByFamily.set(
      family,
      (confidenceByFamily.get(family) ?? 0) + probability,
    );
  }
  let top: FamilyConfidence | null = null;
  for (const [family, confidence] of confidenceByFamily) {
    if (!top || confidence > top.confidence) top = { family, confidence };
  }
  return top;
}
