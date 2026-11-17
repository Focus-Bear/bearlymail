import {
  CRM_MATCH_KINDS,
  CrmCompanySummary,
  CrmContactSummary,
  CrmMatchKind,
} from "../crm-sender-context.types";
import type { CrmRecordMatch } from "../crm-sender-match.store";
import type { BiginAccountRecord, BiginContactRecord } from "./bigin-api.types";
import {
  contactCompany,
  emailDomain,
  toCompanySummary,
  toContactSummary,
  websiteHost,
} from "./bigin-context.mapper";
import {
  BIGIN_MODULES,
  BiginParentModule,
} from "./bigin-sender-context.constants";

/** The Bigin record a sender resolved to, whose deals and notes are shown. */
export interface MatchedParent {
  module: BiginParentModule;
  matchedBy: CrmMatchKind;
  matchCount: number;
  contact: CrmContactSummary | null;
  company: CrmCompanySummary | null;
  recordId: string;
}

const PARENT_MODULES: ReadonlySet<string> = new Set(
  Object.values(BIGIN_MODULES),
);

export function isParentModule(
  module: string | null,
): module is BiginParentModule {
  return module !== null && PARENT_MODULES.has(module);
}

export function contactParent(
  contact: BiginContactRecord,
  matchCount: number,
): MatchedParent {
  return {
    module: BIGIN_MODULES.CONTACTS,
    matchedBy: CRM_MATCH_KINDS.CONTACT_EMAIL,
    matchCount,
    contact: toContactSummary(contact),
    company: contactCompany(contact),
    recordId: contact.id,
  };
}

export function companyParent(
  account: BiginAccountRecord,
  matchCount: number,
): MatchedParent {
  return {
    module: BIGIN_MODULES.ACCOUNTS,
    matchedBy: CRM_MATCH_KINDS.COMPANY_DOMAIN,
    matchCount,
    contact: null,
    company: toCompanySummary(account),
    recordId: account.id,
  };
}

/** Whether a company's website is exactly the sender's email domain. */
export function isSendersCompany(
  account: BiginAccountRecord,
  email: string,
): boolean {
  const domain = emailDomain(email);
  return domain !== null && websiteHost(account.Website) === domain;
}

/** Whether a contact still carries the sender's address (it may have been edited). */
export function isSendersContact(
  contact: BiginContactRecord,
  email: string,
): boolean {
  const sender = email.trim().toLowerCase();
  return [contact.Email, contact.Secondary_Email].some(
    (address) => address?.trim().toLowerCase() === sender,
  );
}

export function toRecordMatch(parent: MatchedParent): CrmRecordMatch {
  return {
    recordModule: parent.module,
    recordId: parent.recordId,
    displayName:
      parent.contact?.name ?? parent.company?.name ?? parent.recordId,
    matchCount: parent.matchCount,
  };
}
