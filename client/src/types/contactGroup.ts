import { Contact } from 'types/contact';

export interface ContactGroupMemberSummary {
  contactId: string;
  email: string;
  name?: string;
}

export interface ContactGroup {
  id: string;
  name: string;
  memberCount: number;
  members: ContactGroupMemberSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactGroupPayload {
  name: string;
  memberContactIds: string[];
}

export interface UpdateContactGroupPayload {
  name?: string;
  memberContactIds?: string[];
}

/** A union search result — either a contact or a group (used in compose dropdown). */
export type RecipientSuggestion =
  | { kind: 'contact'; contact: Contact }
  | { kind: 'group'; group: ContactGroup };
