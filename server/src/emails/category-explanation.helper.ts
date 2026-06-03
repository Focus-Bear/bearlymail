/**
 * Builds an honest categoryExplanation for the category debug panel.
 *
 *  - When the email was routed to a proto category (protoCategoryId set), say
 *    so explicitly so the panel doesn't misreport a bare "Other".
 *  - When the priority path resolved a non-Other category but categoryId is
 *    still null (no matching UserContext and no proto), append a note
 *    explaining why this email ended up in Other.
 */
export function buildHonestCategoryExplanation(options: {
  explanation: string | null;
  finalCategory: string | null;
  categoryId: string | null;
  protoCategoryId?: string | null;
  protoSuggestedName?: string | null;
}): string | null {
  const { explanation, finalCategory, categoryId, protoCategoryId } = options;

  if (protoCategoryId) {
    const label = options.protoSuggestedName
      ? `"${options.protoSuggestedName}"`
      : "an AI-suggested category";
    const note = `Assigned to ${label} — a suggested category pending promotion to your category list.`;
    return explanation ? `${explanation} (${note})` : note;
  }

  if (
    categoryId === null &&
    finalCategory &&
    finalCategory !== "Other" &&
    explanation
  ) {
    return `${explanation} (Note: category "${finalCategory}" not found in your category list — email placed in Other)`;
  }
  return explanation;
}
