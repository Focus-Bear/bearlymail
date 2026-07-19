/**
 * InboxContactTypeBadge
 *
 * Migrated from module-level cache + manual batch queue to TanStack Query.
 *
 * Previously: loadConfigs() used a module-level `configsCache` variable that
 * couldn't deduplicate concurrent requests (all instances mounting in the same
 * tick saw configsCache = null and fired separate requests). scheduleBatch()
 * fired a new /contact-types-by-emails request per 100ms window, causing
 * multiple requests when categories expanded simultaneously.
 *
 * Now:
 *  - useContactTypesQuery (staleTime: 5 min) handles /contacts/types — single
 *    shared request across all badge instances
 *  - useContactTypesByEmailsQuery (staleTime: 2 min) handles
 *    /contacts/contact-types-by-emails — keyed by sorted email list, deduplicated
 *
 * Part of: plan #1225 / PR #1236 — Wave 1 (static endpoints)
 */

import React, { useMemo } from 'react';
import { useContactTypesByEmailsQuery } from 'queries/useContactTypesByEmailsQuery';
import { useContactTypesQuery } from 'queries/useContactTypesQuery';

import { ContactTypeBadge } from './ContactTypeBadge';

interface InboxContactTypeBadgeProps {
  senderEmail: string | null | undefined;
}

export const InboxContactTypeBadge: React.FC<InboxContactTypeBadgeProps> = ({ senderEmail }) => {
  const normalizedEmail = senderEmail?.toLowerCase() ?? null;

  const emails = useMemo(() => (normalizedEmail ? [normalizedEmail] : []), [normalizedEmail]);

  const { data: contactTypes } = useContactTypesQuery();
  const { data: typesByEmails } = useContactTypesByEmailsQuery(emails);

  const config = useMemo(() => {
    if (!normalizedEmail || !contactTypes || !typesByEmails) {
      return null;
    }
    const typeName = typesByEmails[normalizedEmail];
    if (!typeName) {
      return null;
    }
    return contactTypes.find(ct => ct.name === typeName) ?? null;
  }, [normalizedEmail, contactTypes, typesByEmails]);

  if (!config) {
    return null;
  }

  return <ContactTypeBadge label={config.label} color={config.color} icon={config.icon} />;
};
