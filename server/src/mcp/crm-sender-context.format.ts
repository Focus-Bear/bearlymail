import type {
  CrmDealSummary,
  CrmNoteSummary,
  CrmSenderContext,
} from "./crm-sender-context.types";

const LINE_SEPARATOR = "\n";
const FIELD_SEPARATOR = " · ";
const LIST_ITEM_PREFIX = "- ";

function compact(parts: Array<string | null>): string {
  return parts.filter((part): part is string => !!part).join(FIELD_SEPARATOR);
}

function formatDeal(deal: CrmDealSummary): string {
  return `${LIST_ITEM_PREFIX}${compact([
    deal.name,
    deal.stage,
    deal.amount === null ? null : String(deal.amount),
    deal.closingDate ? `closes ${deal.closingDate}` : null,
    deal.pipeline,
  ])}`;
}

function formatNote(note: CrmNoteSummary): string {
  return `${LIST_ITEM_PREFIX}${compact([note.createdAt, note.title, note.content])}`;
}

function section(heading: string, lines: string[]): string[] {
  return lines.length > 0 ? [heading, ...lines] : [];
}

/**
 * Plain-text rendering of a CRM context: the card's fallback text and a
 * compact block a single LLM prompt can include verbatim.
 */
export function formatCrmSenderContext(context: CrmSenderContext): string {
  const { contact, company } = context;
  const lines = [
    contact
      ? `Contact: ${compact([contact.name, contact.title, contact.owner ? `owner ${contact.owner}` : null])}`
      : null,
    company ? `Company: ${compact([company.name, company.website])}` : null,
    context.matchCount > 1
      ? `${context.matchCount} matching records; showing the most recently updated`
      : null,
    ...section("Deals:", context.deals.map(formatDeal)),
    ...section("Recent notes:", context.notes.map(formatNote)),
  ];
  return lines
    .filter((line): line is string => line !== null)
    .join(LINE_SEPARATOR);
}
