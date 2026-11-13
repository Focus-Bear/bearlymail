/**
 * CRM context about an email sender, built server-side by fixed lookups
 * (currently Zoho Bigin). Mirrors server/src/mcp/crm-sender-context.types.ts.
 */
export const CRM_MATCH_KINDS = {
  CONTACT_EMAIL: 'contact_email',
  COMPANY_DOMAIN: 'company_domain',
} as const;

export type CrmMatchKind = (typeof CRM_MATCH_KINDS)[keyof typeof CRM_MATCH_KINDS];

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

export interface CrmSenderContext {
  provider: string;
  matchedBy: CrmMatchKind;
  matchCount: number;
  contact: CrmContactSummary | null;
  company: CrmCompanySummary | null;
  deals: CrmDealSummary[];
  notes: CrmNoteSummary[];
}
