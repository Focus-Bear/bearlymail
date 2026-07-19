export interface Contact {
  id?: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
  phone?: string;
  isFavorite?: boolean;
  contactFrequency?: number;
  contactType?: string | null;
  followUpDate?: string | null;
  /** True when the contact has a local DB record (safe to navigate to /crm/contacts/:id).
   *  False for Gmail-only search results whose id is a Google People API resource name.
   *  Undefined means old server response — treat as navigable (isLocal !== false). */
  isLocal?: boolean;
}

export interface ContactDetail extends Contact {
  notes: ContactNote[];
  customFields: ContactCustomFieldValue[];
  deals: ContactDealSummary[];
}

export interface ContactNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactCustomFieldValue {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  value: string | null;
  options?: string[];
}

export interface ContactDealSummary {
  id: string;
  title: string;
  value: number | null;
  stageName: string | null;
}

export interface ContactTypeConfig {
  id: string;
  name: string;
  label: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
}

export interface CustomFieldDefinition {
  id: string;
  fieldName: string;
  fieldType: string;
  options: string | null;
  sortOrder: number;
}
