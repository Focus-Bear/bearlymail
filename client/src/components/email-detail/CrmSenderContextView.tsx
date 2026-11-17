import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiExternalLink } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { CRM_MATCH_KINDS, CrmDealSummary, CrmNoteSummary, CrmSenderContext } from 'types/crm-sender-context';

const DETAIL_SEPARATOR = ' · ';
const LINK_ICON_SIZE = 12;

const headingStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.tertiary,
  textTransform: 'uppercase',
  marginTop: theme.spacing.sm,
  marginBottom: theme.spacing.xs,
};

const mutedStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.tertiary,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.xs,
};

const joinDetails = (parts: Array<string | null | undefined>): string =>
  parts.filter((part): part is string => !!part).join(DETAIL_SEPARATOR);

/** Bigin's date fields (e.g. Closing_Date) are calendar dates with no time zone. */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UTC_TIME_ZONE = 'UTC';

const formatDate = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  // A date-only string parses as UTC midnight; formatting it in local time
  // would show the previous day west of Greenwich.
  return DATE_ONLY_PATTERN.test(value)
    ? parsed.toLocaleDateString(undefined, { timeZone: UTC_TIME_ZONE })
    : parsed.toLocaleDateString();
};

const DealRow: React.FC<{ deal: CrmDealSummary }> = ({ deal }) => {
  const { t } = useTranslation();
  const closes = formatDate(deal.closingDate);
  const details = joinDetails([
    deal.stage,
    deal.amount === null ? null : deal.amount.toLocaleString(),
    closes ? t('senderContext.crm.closes', { date: closes }) : null,
    deal.pipeline,
  ]);
  return (
    <li>
      <span
        style={{
          fontWeight: theme.typography.fontWeight.medium,
          color: deal.isOpen ? theme.colors.text.primary : theme.colors.text.tertiary,
        }}
      >
        {deal.name}
      </span>
      {!deal.isOpen && <span style={mutedStyle}> ({t('senderContext.crm.closed')})</span>}
      {details && <div style={mutedStyle}>{details}</div>}
    </li>
  );
};

const NoteRow: React.FC<{ note: CrmNoteSummary }> = ({ note }) => {
  const meta = joinDetails([formatDate(note.createdAt), note.title]);
  return (
    <li>
      {meta && <div style={mutedStyle}>{meta}</div>}
      <div>{note.content}</div>
    </li>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section aria-label={title}>
    <div style={headingStyle}>{title}</div>
    {children}
  </section>
);

const RecordLink: React.FC<{ url: string; sourceName: string }> = ({ url, sourceName }) => {
  const { t } = useTranslation();
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.xs,
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        color: theme.colors.text.secondary,
        textDecoration: 'underline',
      }}
    >
      <FiExternalLink size={LINK_ICON_SIZE} aria-hidden="true" />
      {t('senderContext.crm.openRecord', { name: sourceName })}
    </a>
  );
};

interface CrmSenderContextViewProps {
  context: CrmSenderContext;
  /** The connection's display name (e.g. "Zoho Bigin"), for the "Open in" link. */
  sourceName: string;
}

/** Structured CRM context (contact, company, deals, notes) for one sender. */
export const CrmSenderContextView: React.FC<CrmSenderContextViewProps> = ({ context, sourceName }) => {
  const { t } = useTranslation();
  const { contact, company, deals, notes, recordUrl } = context;
  return (
    <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
      {contact && (
        <div>
          <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>{contact.name}</span>
          {contact.title && <span style={mutedStyle}>{DETAIL_SEPARATOR + contact.title}</span>}
        </div>
      )}
      {company && <div>{joinDetails([company.name, company.website])}</div>}
      {contact?.owner && <div style={mutedStyle}>{t('senderContext.crm.owner', { name: contact.owner })}</div>}
      {context.matchedBy === CRM_MATCH_KINDS.COMPANY_DOMAIN && (
        <div style={mutedStyle}>{t('senderContext.crm.matchedByDomain')}</div>
      )}
      {context.matchCount > 1 && (
        <div style={mutedStyle}>{t('senderContext.crm.multipleMatches', { count: context.matchCount })}</div>
      )}
      {recordUrl && <RecordLink url={recordUrl} sourceName={sourceName} />}
      {deals.length > 0 && (
        <Section title={t('senderContext.crm.deals')}>
          <ul style={listStyle}>
            {deals.map(deal => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </ul>
        </Section>
      )}
      {notes.length > 0 && (
        <Section title={t('senderContext.crm.recentNotes')}>
          <ul style={listStyle}>
            {notes.map(note => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
