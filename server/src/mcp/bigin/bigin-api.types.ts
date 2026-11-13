/**
 * The subset of Zoho Bigin REST v2 record shapes the sender-context lookup
 * reads. Every field is optional because Bigin omits empty fields and layouts
 * are user-customisable.
 */

export interface BiginLookupValue {
  id?: string;
  name?: string;
}

export interface BiginContactRecord {
  id: string;
  First_Name?: string | null;
  Last_Name?: string | null;
  Full_Name?: string | null;
  Email?: string | null;
  Secondary_Email?: string | null;
  Title?: string | null;
  Account_Name?: BiginLookupValue | null;
  Owner?: BiginLookupValue | null;
  Modified_Time?: string | null;
}

export interface BiginAccountRecord {
  id: string;
  Account_Name?: string | null;
  Website?: string | null;
  Modified_Time?: string | null;
}

export interface BiginDealRecord {
  id: string;
  Deal_Name?: string | null;
  Stage?: string | null;
  Amount?: number | null;
  Closing_Date?: string | null;
  Pipeline?: BiginLookupValue | null;
  Sub_Pipeline?: string | null;
  Modified_Time?: string | null;
}

export interface BiginNoteRecord {
  id: string;
  Note_Title?: string | null;
  Note_Content?: string | null;
  Created_Time?: string | null;
}
