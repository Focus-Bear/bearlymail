import type {
  CrmCompanySummary,
  CrmContactSummary,
  CrmDealSummary,
  CrmNoteSummary,
} from "../crm-sender-context.types";
import type {
  BiginAccountRecord,
  BiginContactRecord,
  BiginDealRecord,
  BiginNoteRecord,
} from "./bigin-api.types";
import {
  BIGIN_CLOSED_STAGE_PREFIX,
  BIGIN_LIMITS,
  FREE_MAIL_DOMAINS,
} from "./bigin-sender-context.constants";

const EMAIL_DOMAIN_SEPARATOR = "@";
const WWW_PREFIX = "www.";
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const DEFAULT_URL_SCHEME = "https://";
const ELLIPSIS = "…";
const WHITESPACE_RUN = /\s+/g;

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const timeOf = (value: string | null | undefined): number => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

/** The record modified most recently; ties keep Bigin's own order. */
export function pickMostRecent<
  TRecord extends { Modified_Time?: string | null },
>(records: TRecord[]): TRecord | null {
  return records.reduce<TRecord | null>(
    (best, record) =>
      best && timeOf(best.Modified_Time) >= timeOf(record.Modified_Time)
        ? best
        : record,
    null,
  );
}

/** Lowercased domain of an email address, or null if it has none. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf(EMAIL_DOMAIN_SEPARATOR);
  if (at < 0) return null;
  return textOrNull(email.slice(at + 1).toLowerCase());
}

/** Whether a company-by-domain lookup could identify the sender's company. */
export function isCompanyDomain(domain: string): boolean {
  return !FREE_MAIL_DOMAINS.has(domain);
}

/** Host of a CRM website value ("https://www.acme.com/about" → "acme.com"). */
export function websiteHost(website: string | null | undefined): string | null {
  const raw = textOrNull(website);
  if (!raw) return null;
  const withScheme = URL_SCHEME_PATTERN.test(raw)
    ? raw
    : `${DEFAULT_URL_SCHEME}${raw}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.startsWith(WWW_PREFIX) ? host.slice(WWW_PREFIX.length) : host;
  } catch {
    return null;
  }
}

export function contactName(contact: BiginContactRecord): string {
  const parts = [contact.First_Name, contact.Last_Name]
    .map(textOrNull)
    .filter((part): part is string => part !== null);
  return (
    textOrNull(contact.Full_Name) ??
    (parts.length > 0 ? parts.join(" ") : null) ??
    textOrNull(contact.Email) ??
    contact.id
  );
}

export function toContactSummary(
  contact: BiginContactRecord,
): CrmContactSummary {
  return {
    id: contact.id,
    name: contactName(contact),
    title: textOrNull(contact.Title),
    owner: textOrNull(contact.Owner?.name),
  };
}

/** The company a contact is linked to, if any (name only — no extra call). */
export function contactCompany(
  contact: BiginContactRecord,
): CrmCompanySummary | null {
  const account = contact.Account_Name;
  const name = textOrNull(account?.name);
  if (!account?.id || !name) return null;
  return { id: account.id, name, website: null };
}

export function toCompanySummary(
  account: BiginAccountRecord,
): CrmCompanySummary {
  return {
    id: account.id,
    name: textOrNull(account.Account_Name) ?? account.id,
    website: textOrNull(account.Website),
  };
}

export function isOpenStage(stage: string | null): boolean {
  return !stage?.toLowerCase().startsWith(BIGIN_CLOSED_STAGE_PREFIX);
}

function toDealSummary(deal: BiginDealRecord): CrmDealSummary {
  const stage = textOrNull(deal.Stage);
  return {
    id: deal.id,
    name: textOrNull(deal.Deal_Name) ?? deal.id,
    stage,
    isOpen: isOpenStage(stage),
    amount: typeof deal.Amount === "number" ? deal.Amount : null,
    closingDate: textOrNull(deal.Closing_Date),
    pipeline: textOrNull(deal.Sub_Pipeline) ?? textOrNull(deal.Pipeline?.name),
  };
}

/** Open deals first, then most recently modified, capped. */
export function toDealSummaries(deals: BiginDealRecord[]): CrmDealSummary[] {
  return [...deals]
    .sort(
      (first, second) =>
        Number(isOpenStage(textOrNull(second.Stage))) -
          Number(isOpenStage(textOrNull(first.Stage))) ||
        timeOf(second.Modified_Time) - timeOf(first.Modified_Time),
    )
    .slice(0, BIGIN_LIMITS.DEALS_KEPT)
    .map(toDealSummary);
}

function truncate(text: string, maxChars: number): string {
  const flat = text.replace(WHITESPACE_RUN, " ").trim();
  return flat.length > maxChars
    ? `${flat.slice(0, maxChars - ELLIPSIS.length)}${ELLIPSIS}`
    : flat;
}

/** Most recent notes first, empty ones dropped, bodies trimmed. */
export function toNoteSummaries(notes: BiginNoteRecord[]): CrmNoteSummary[] {
  return notes
    .filter((note) => textOrNull(note.Note_Content) !== null)
    .sort(
      (first, second) =>
        timeOf(second.Created_Time) - timeOf(first.Created_Time),
    )
    .slice(0, BIGIN_LIMITS.NOTES_KEPT)
    .map((note) => ({
      id: note.id,
      title: textOrNull(note.Note_Title),
      content: truncate(note.Note_Content ?? "", BIGIN_LIMITS.NOTE_MAX_CHARS),
      createdAt: textOrNull(note.Created_Time),
    }));
}
