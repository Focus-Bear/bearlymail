import type { CrmProvider } from "./bigin/bigin-sender-context.constants";

/** How the sender was matched in the CRM. */
export const CRM_MATCH_KINDS = {
  /** A contact whose email is the sender's address. */
  CONTACT_EMAIL: "contact_email",
  /** No contact; a company whose website is the sender's email domain. */
  COMPANY_DOMAIN: "company_domain",
} as const;

export type CrmMatchKind =
  (typeof CRM_MATCH_KINDS)[keyof typeof CRM_MATCH_KINDS];

export interface CrmContactSummary {
  id: string;
  name: string;
  title: string | null;
  owner: string | null;
}

export interface CrmCompanySummary {
  id: string;
  name: string;
  website: string | null;
}

export interface CrmDealSummary {
  id: string;
  name: string;
  stage: string | null;
  isOpen: boolean;
  amount: number | null;
  closingDate: string | null;
  pipeline: string | null;
}

export interface CrmNoteSummary {
  id: string;
  title: string | null;
  content: string;
  createdAt: string | null;
}

/**
 * Compact, provider-neutral CRM context about one sender, built by fixed
 * lookups rather than by a model choosing tools. Small enough to hand to a
 * single LLM call as-is.
 */
export interface CrmSenderContext {
  provider: CrmProvider;
  matchedBy: CrmMatchKind;
  /** How many records matched; above 1 means the most recent one was used. */
  matchCount: number;
  contact: CrmContactSummary | null;
  company: CrmCompanySummary | null;
  /** Open deals first, then most recently modified. */
  deals: CrmDealSummary[];
  /** Most recent first. */
  notes: CrmNoteSummary[];
  /** Link to the matched record in the CRM's web app, when it can be built. */
  recordUrl: string | null;
}
