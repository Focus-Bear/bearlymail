import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';

import { RoleFilterTab } from 'components/crm/RoleFilterTab';
import { ThreadRow } from 'components/crm/ThreadRow';
import { FILTER_ROLE_ALL, STRING_FLEX } from 'constants/strings';
import { ContactThread, ContactThreadRoleFilter } from 'hooks/useContactThreads';

export interface ContactThreadListProps {
  /** Filtered thread list to render (filtering happens in useContactThreads). */
  filteredThreads: ContactThread[];
  isLoading: boolean;
  hasError: boolean;
  keyword: string;
  roleFilter: ContactThreadRoleFilter;
  onKeywordChange: (keyword: string) => void;
  onRoleFilterChange: (role: ContactThreadRoleFilter) => void;
  sectionStyle: React.CSSProperties;
  inputStyle: React.CSSProperties;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export const ContactThreadList: React.FC<ContactThreadListProps> = ({
  filteredThreads,
  isLoading,
  hasError,
  keyword,
  roleFilter,
  onKeywordChange,
  onRoleFilterChange,
  sectionStyle,
  inputStyle,
  t,
}) => {
  const navigate = useNavigate();

  const handleNavigate = useCallback((emailThreadId: string) => navigate(`/email/${emailThreadId}`), [navigate]);

  const roleFilterTabs: { label: string; value: ContactThreadRoleFilter }[] = [
    { label: t('contacts.threads.roleAll'), value: 'all' },
    { label: t('contacts.threads.roleTo'), value: 'to' },
    { label: t('contacts.threads.roleCc'), value: 'cc' },
  ];

  const showEmpty = !isLoading && !hasError && filteredThreads.length === 0;
  const showList = !isLoading && !hasError && filteredThreads.length > 0;
  const isFiltering = Boolean(keyword) || roleFilter !== FILTER_ROLE_ALL;

  return (
    <div style={sectionStyle}>
      <h2
        style={{
          ...theme.typography.heading.h5,
          color: theme.colors.text.primary,
          margin: 0,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('contacts.threads.title')}
      </h2>

      <input
        type="text"
        value={keyword}
        onChange={event => onKeywordChange(event.target.value)}
        placeholder={t('contacts.threads.searchPlaceholder')}
        style={{ ...inputStyle, marginBottom: theme.spacing.sm }}
      />

      <div style={{ display: STRING_FLEX, gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
        {roleFilterTabs.map(tab => (
          <RoleFilterTab
            key={tab.value}
            label={tab.label}
            value={tab.value}
            active={roleFilter === tab.value}
            onClick={onRoleFilterChange}
          />
        ))}
      </div>

      {isLoading && (
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('contacts.threads.loading')}
        </div>
      )}

      {hasError && !isLoading && (
        <div style={{ color: theme.colors.accent.error, fontSize: theme.typography.fontSize.sm }}>
          {t('contacts.threads.loadError')}
        </div>
      )}

      {showEmpty && (
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.sm }}>
          {isFiltering ? t('contacts.threads.noResults') : t('contacts.threads.noThreads')}
        </div>
      )}

      {showList && (
        <>
          <div
            style={{
              display: STRING_FLEX,
              flexDirection: 'column',
              gap: theme.spacing.sm,
              maxHeight: '480px',
              overflowY: 'auto',
            }}
          >
            {filteredThreads.map(thread => (
              <ThreadRow key={thread.emailThreadId} thread={thread} onNavigate={handleNavigate} />
            ))}
          </div>
          <div
            style={{
              marginTop: theme.spacing.sm,
              color: theme.colors.text.tertiary,
              fontSize: theme.typography.fontSize.xs,
              textAlign: 'right' as const,
            }}
          >
            {t('contacts.threads.count', { count: filteredThreads.length })}
          </div>
        </>
      )}
    </div>
  );
};

export default ContactThreadList;
