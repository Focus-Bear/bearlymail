/**
 * Utility functions for building email search queries across providers.
 * Extracted from ContextEmailDataService for size compliance.
 */
import { MS_PER_SECOND } from "../constants/time-constants";
import { EmailProvider } from "../emails/interfaces/email-provider.interface";

/** Provider type constants to avoid magic strings */
export const PROVIDER_TYPE = {
  GMAIL: "Gmail",
  OFFICE365: "Office365",
  ZOHO: "Zoho",
} as const;

/** Format date for Gmail search query (YYYY/MM/DD format) */
export function formatGmailDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/** Format date for Office365 filter (ISO 8601 format) */
export function formatOffice365Date(date: Date): string {
  return date.toISOString();
}

/** Format date for Zoho search (Unix timestamp in seconds) */
export function formatZohoDate(date: Date): string {
  return Math.floor(date.getTime() / MS_PER_SECOND).toString();
}

/**
 * Get a human-readable provider type name from a provider instance.
 * Centralises the constructor.name heuristic so callers use a typed string
 * instead of raw constructor name checks.
 */
export function getProviderTypeName(provider: EmailProvider): string {
  const providerName = provider.constructor.name;
  if (providerName.includes("Gmail")) return PROVIDER_TYPE.GMAIL;
  if (providerName.includes("Office365") || providerName.includes("Office"))
    return PROVIDER_TYPE.OFFICE365;
  if (providerName.includes("Zoho")) return PROVIDER_TYPE.ZOHO;
  return providerName;
}

/** Build date range query for a provider */
export function buildDateRangeQuery(
  provider: EmailProvider,
  after: Date,
  before: Date,
): string {
  const providerType = getProviderTypeName(provider);
  if (providerType === PROVIDER_TYPE.GMAIL) {
    return `after:${formatGmailDate(after)} before:${formatGmailDate(before)}`;
  }
  if (providerType === PROVIDER_TYPE.OFFICE365) {
    return `receivedDateTime ge ${formatOffice365Date(after)} and receivedDateTime le ${formatOffice365Date(before)}`;
  }
  if (providerType === PROVIDER_TYPE.ZOHO) {
    return `receivedTime >= ${formatZohoDate(after)} AND receivedTime <= ${formatZohoDate(before)}`;
  }
  return `after:${formatGmailDate(after)} before:${formatGmailDate(before)}`;
}

/** Build sent folder query for a provider */
export function buildSentFolderQuery(
  provider: EmailProvider,
  after: Date,
  before: Date,
): string {
  const providerType = getProviderTypeName(provider);
  if (providerType === PROVIDER_TYPE.GMAIL) {
    return `after:${formatGmailDate(after)} before:${formatGmailDate(before)} in:sent`;
  }
  if (providerType === PROVIDER_TYPE.OFFICE365) {
    return `receivedDateTime ge ${formatOffice365Date(after)} and receivedDateTime le ${formatOffice365Date(before)} and isSent eq true`;
  }
  if (providerType === PROVIDER_TYPE.ZOHO) {
    return `receivedTime >= ${formatZohoDate(after)} AND receivedTime <= ${formatZohoDate(before)} AND folderid:sent`;
  }
  return `after:${formatGmailDate(after)} before:${formatGmailDate(before)} in:sent`;
}
