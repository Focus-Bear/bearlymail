import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDatabase, FiRefreshCw, FiSettings } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { theme } from 'theme/theme';

import { CollapsibleSection } from 'components/common/CollapsibleSection';
import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';

const CONTEXT_PROVIDERS_SETTINGS_PATH = '/settings#workflows';

const SENDER_CONTEXT_ACCENT = '#0EA5E9'; // Sky blue
const SENDER_CONTEXT_BG = '#F0F9FF';

interface SenderContextEntry {
  serverId: string;
  serverName: string;
  toolName: string;
  text: string;
}

interface SenderContextResult {
  entries: SenderContextEntry[];
  fetchedAt: string;
  fromCache: boolean;
}

interface SenderContextSectionProps {
  senderEmail?: string;
  /** When provided, shows a dismiss (X) button on the card header. */
  onDismiss?: () => void;
}

interface EntryCardProps {
  entry: SenderContextEntry;
}

const EntryCard: React.FC<EntryCardProps> = ({ entry }) => (
  <div
    style={{
      padding: theme.spacing.md,
      backgroundColor: COLOR_NAMED_WHITE,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <div
      style={{
        fontWeight: theme.typography.fontWeight.semibold,
        fontSize: theme.typography.fontSize.xs,
        color: SENDER_CONTEXT_ACCENT,
        marginBottom: theme.spacing.xs,
      }}
    >
      {entry.serverName}
    </div>
    <div
      style={{
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {entry.text}
    </div>
  </div>
);

interface SectionContentProps {
  loading: boolean;
  error: string | null;
  entries: SenderContextEntry[];
  onConfigure: () => void;
  t: (key: string) => string;
}

const EmptyState: React.FC<{ onConfigure: () => void; t: (key: string) => string }> = ({ onConfigure, t }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: theme.spacing.sm,
      padding: theme.spacing.lg,
      textAlign: 'center',
    }}
  >
    <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
      {t('senderContext.noContext')}
    </div>
    <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>
      {t('senderContext.emptyHint')}
    </div>
    <button
      type="button"
      onClick={onConfigure}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.xs,
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: COLOR_NAMED_WHITE,
        border: `1px solid ${SENDER_CONTEXT_ACCENT}`,
        borderRadius: theme.borderRadius.md,
        color: SENDER_CONTEXT_ACCENT,
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.medium,
        cursor: 'pointer',
      }}
    >
      <FiSettings size={14} />
      {t('senderContext.configureProviders')}
    </button>
  </div>
);

const SectionContent: React.FC<SectionContentProps> = ({ loading, error, entries, onConfigure, t }) => {
  if (loading) {
    return (
      <div style={{ padding: theme.spacing.md, color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        {t('common.loading')}
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: theme.spacing.md, color: theme.colors.error.main, fontSize: theme.typography.fontSize.sm }}>
        {error}
      </div>
    );
  }
  if (entries.length === 0) {
    return <EmptyState onConfigure={onConfigure} t={t} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      {entries.map(entry => (
        <EntryCard key={entry.serverId} entry={entry} />
      ))}
    </div>
  );
};

const useSenderContext = (senderEmail: string | undefined) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SenderContextEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Reset cached results when the viewed sender changes so we re-fetch for the new email.
  useEffect(() => {
    setEntries([]);
    setError(null);
    setHasFetched(false);
  }, [senderEmail]);

  const fetchContext = useCallback(
    async (forceRefresh = false) => {
      if (!senderEmail) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get<SenderContextResult>(`${API_URL}/mcp-servers/sender-context`, {
          params: { email: senderEmail, refresh: forceRefresh ? 'true' : undefined },
        });
        setEntries(response.data?.entries ?? []);
      } catch (err) {
        console.error('Error fetching sender context:', err);
        setError(t('senderContext.errorLoading'));
      } finally {
        setLoading(false);
        setHasFetched(true);
      }
    },
    [senderEmail, t]
  );

  return { entries, loading, error, hasFetched, fetchContext };
};

export const SenderContextSection: React.FC<SenderContextSectionProps> = ({ senderEmail, onDismiss }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { entries, loading, error, hasFetched, fetchContext } = useSenderContext(senderEmail);

  useEffect(() => {
    if (!isCollapsed && !hasFetched) {
      fetchContext();
    }
  }, [isCollapsed, hasFetched, fetchContext]);

  if (!senderEmail) {
    return null;
  }

  let preview: string;
  if (loading) {
    preview = t('common.loading');
  } else if (!hasFetched) {
    preview = t('senderContext.expandToLoad');
  } else if (entries.length === 0) {
    preview = t('senderContext.noContext');
  } else {
    preview = t('senderContext.sourceCount', { count: entries.length });
  }

  const controls = (
    <button
      onClick={event => {
        event.stopPropagation();
        fetchContext(true);
      }}
      disabled={loading}
      style={{
        background: 'transparent',
        border: 'none',
        color: theme.colors.text.secondary,
        cursor: loading ? 'default' : 'pointer',
        fontSize: theme.typography.fontSize.sm,
        padding: theme.spacing.xs,
        display: 'flex',
        alignItems: 'center',
      }}
      title={t('senderContext.refresh')}
    >
      <FiRefreshCw size={14} />
    </button>
  );

  return (
    <CollapsibleSection
      icon={<FiDatabase size={18} />}
      title={t('senderContext.title')}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed(!isCollapsed)}
      accentColor={SENDER_CONTEXT_ACCENT}
      backgroundColor={SENDER_CONTEXT_BG}
      preview={preview}
      controls={controls}
      onDismiss={onDismiss}
      dismissTitle={t('emailDetail.hideCard')}
    >
      <SectionContent
        loading={loading}
        error={error}
        entries={entries}
        onConfigure={() => navigate(CONTEXT_PROVIDERS_SETTINGS_PATH)}
        t={t}
      />
    </CollapsibleSection>
  );
};
