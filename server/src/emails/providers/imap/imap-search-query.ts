import type { SearchObject } from "imapflow";

import {
  GMAIL_SEARCH_OPERATORS,
  GMAIL_SEARCH_VALUES,
} from "../../../constants/mail-server.constants";

/**
 * Search and context analysis pass every provider Gmail-style queries
 * (`from:x after:2026/01/01 in:sent`). IMAP has its own SEARCH grammar, so
 * these are the operators we translate; anything else becomes full-text.
 */
export const IMAP_SEARCH_SCOPE = {
  INBOX: "inbox",
  SENT: "sent",
  ALL: "all",
} as const;

export type ImapSearchScope =
  (typeof IMAP_SEARCH_SCOPE)[keyof typeof IMAP_SEARCH_SCOPE];

export interface ImapSearchQuery {
  scope: ImapSearchScope;
  criteria: SearchObject;
}

const OPERATOR_PATTERN = /(\w+):("[^"]*"|\S+)/g;
const GMAIL_DATE_PATTERN = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;

function unquote(value: string): string {
  return value.replace(/^"|"$/g, "");
}

function parseGmailDate(value: string): Date | undefined {
  const match = GMAIL_DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function applyOperator(
  query: ImapSearchQuery,
  operator: string,
  value: string,
): boolean {
  switch (operator.toLowerCase()) {
    case GMAIL_SEARCH_OPERATORS.FROM:
      query.criteria.from = value;
      return true;
    case GMAIL_SEARCH_OPERATORS.TO:
      query.criteria.to = value;
      return true;
    case GMAIL_SEARCH_OPERATORS.SUBJECT:
      query.criteria.subject = value;
      return true;
    case GMAIL_SEARCH_OPERATORS.AFTER:
      query.criteria.since = parseGmailDate(value);
      return true;
    case GMAIL_SEARCH_OPERATORS.BEFORE:
      query.criteria.before = parseGmailDate(value);
      return true;
    case GMAIL_SEARCH_OPERATORS.IN:
      if (value.toLowerCase() === GMAIL_SEARCH_VALUES.SENT) {
        query.scope = IMAP_SEARCH_SCOPE.SENT;
      } else if (value.toLowerCase() === GMAIL_SEARCH_VALUES.ANYWHERE) {
        query.scope = IMAP_SEARCH_SCOPE.ALL;
      }
      return true;
    case GMAIL_SEARCH_OPERATORS.IS:
      if (value === GMAIL_SEARCH_VALUES.UNREAD) query.criteria.seen = false;
      if (value === GMAIL_SEARCH_VALUES.STARRED) query.criteria.flagged = true;
      return true;
    default:
      return false;
  }
}

export function translateSearchQuery(query: string): ImapSearchQuery {
  const translated: ImapSearchQuery = {
    scope: IMAP_SEARCH_SCOPE.INBOX,
    criteria: {},
  };
  const leftover = query.replace(
    OPERATOR_PATTERN,
    (token, operator: string, rawValue: string) =>
      applyOperator(translated, operator, unquote(rawValue)) ? " " : token,
  );
  const text = leftover.trim().replace(/\s+/g, " ");
  if (text) translated.criteria.text = unquote(text);
  if (Object.keys(translated.criteria).length === 0) {
    translated.criteria.all = true;
  }
  return translated;
}
