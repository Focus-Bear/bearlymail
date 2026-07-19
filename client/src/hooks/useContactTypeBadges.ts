/**
 * useContactTypeBadges
 *
 * Migrated from independent axios.get calls to TanStack Query.
 *
 * Previously: fetched /contacts/types with a per-instance ref guard (only
 * deduped within the same hook instance, not across components). Fetched
 * /contacts/contact-types-by-emails per unique email set on each change.
 *
 * Now: delegates to useContactTypesQuery and useContactTypesByEmailsQuery,
 * both of which are shared across all callers via the QueryClient cache.
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */

import { useCallback, useMemo } from 'react';
import { useContactTypesByEmailsQuery } from 'queries/useContactTypesByEmailsQuery';
import { useContactTypesQuery } from 'queries/useContactTypesQuery';
import { ContactTypeConfig } from 'types/contact';
import { Email } from 'types/email';

export function useContactTypeBadges(emails: Email[], loading: boolean) {
  // Derive sorted unique sender emails from the email list
  const senderEmails = useMemo(() => {
    if (loading || emails.length === 0) {
      return [];
    }
    const raw = emails
      .map(email => email.correspondentEmail || email.from)
      .filter(Boolean)
      .map(email => email!.toLowerCase());
    return [...new Set(raw)];
  }, [emails, loading]);

  const { data: contactTypeConfigs = [] } = useContactTypesQuery();
  const { data: contactTypeMap = {} } = useContactTypesByEmailsQuery(senderEmails);

  const getContactTypeConfig = useCallback(
    (email: string | null | undefined): ContactTypeConfig | undefined => {
      if (!email) {
        return undefined;
      }
      const typeName = contactTypeMap[email.toLowerCase()];
      if (!typeName) {
        return undefined;
      }
      return contactTypeConfigs.find(ct => ct.name === typeName);
    },
    [contactTypeMap, contactTypeConfigs]
  );

  return { contactTypeMap, contactTypeConfigs, getContactTypeConfig };
}
