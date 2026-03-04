import React, { useCallback,useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore,InboxMode } from 'types/email';

import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { OPACITY_DISABLED } from 'constants/numbers';
import { CATEGORY_DANGEROUS_PHISHING, CATEGORY_OTHER, KEY_ESCAPE, KEY_Y, MODE_AUTORESPONDED,PHISHING_CONFIDENCE_HIGH, PHISHING_CONFIDENCE_MEDIUM, STRING_NONE } from 'constants/strings';

interface CategoryAccordionProps {
  category: string;
  emails: Email[];
  /** Total count from the inbox summary (shown in badge even before emails are loaded) */
  count?: number;
  /** True while the category emails are being fetched for the first time */
  isLoadingContent?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onArchiveAll?: (emailIds: string[]) => Promise<void>;
  children: React.ReactNode;
  onReanalyseOther?: () => void;
  isReanalysingOther?: boolean;
}

const DEFAULT_CATEGORY_TRANSLATIONS: Record<string, string> = {
  'Newsletters': 'inbox.category.newsletters',
  'Sales': 'inbox.category.sales',
  'Partnerships': 'inbox.category.partnerships',
  'Customer Support': 'inbox.category.customerSupport',
  'HR Admin': 'inbox.category.hrAdmin',
  'Other': 'inbox.category.other',
  [CATEGORY_DANGEROUS_PHISHING]: 'inbox.category.dangerousPhishing',
};

const isDefaultCategory = (category: string): boolean => {
  return category in DEFAULT_CATEGORY_TRANSLATIONS;
};

const getCategoryTranslationKey = (category: string): string | null => {
  return DEFAULT_CATEGORY_TRANSLATIONS[category] || null;
};

const getCategoryIcon = (category: string): string => {
  const icons: Record<string, string> = {
    'Newsletters': '📰',
    'Sales': '💼',
    'Partnerships': '🤝',
    'Customer Support': '🎧',
    'HR Admin': '📋',
    'Other': '📧',
    [CATEGORY_DANGEROUS_PHISHING]: '🛑',
  };
  return icons[category] || '📧';
};

const EDIT_ICON = '✏️';

const REANALYSE_ICON = '🔄';

const ARCHIVE_ALL_ICON = '🗄️';

interface ReanalyseButtonProps {
  onClick: (e: React.MouseEvent) => void;
  isReanalysing: boolean;
  label: string;
}

const ReanalyseButton: React.FC<ReanalyseButtonProps> = ({ onClick, isReanalysing, label }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isReanalysing}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        borderRadius: theme.borderRadius.sm,
        border: STRING_NONE,
        backgroundColor: isHovered ? theme.colors.interactive.hover : 'transparent',
        color: isReanalysing ? theme.colors.text.disabled : theme.colors.text.tertiary,
        fontSize: theme.typography.fontSize.sm,
        cursor: isReanalysing ? 'not-allowed' : 'pointer',
        transition: theme.transitions.fast,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        opacity: isReanalysing ? OPACITY_DISABLED : 1,
      }}
      title={label}
    >
      <span style={{ animation: isReanalysing ? 'spin 1s linear infinite' : 'none' }}>
        {REANALYSE_ICON}
      </span>
      {label}
    </button>
  );
};

function makeArchiveKeyDownHandler(
  onConfirm: () => void,
  onCancel: () => void
): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === KEY_Y) {
      e.stopPropagation();
      onConfirm();
    } else if (e.key === KEY_ESCAPE) {
      e.stopPropagation();
      onCancel();
    }
  };
}

export const CategoryAccordion: React.FC<CategoryAccordionProps> = ({
  category,
  emails,
  count,
  isLoadingContent,
  isExpanded,
  onToggle,
  onArchiveAll,
  children,
  onReanalyseOther,
  isReanalysingOther,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [isPencilHovered, setIsPencilHovered] = useState(false);
  const [isArchiveAllHovered, setIsArchiveAllHovered] = useState(false);
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);
  // Use summary count when available (shows accurate count even before emails are loaded)
  const emailCount = count !== undefined ? count : emails.length;
  const emailIds = emails.map(e => e.id);
  const isOtherCategory = category === CATEGORY_OTHER;

  const handleEditCategoryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate('/settings#email-categories');
  };

  const handleArchiveAllClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (emailCount > 0) {
      setShowArchiveConfirmation(true);
    }
  };

  const handleConfirmArchive = useCallback(async () => {
    setShowArchiveConfirmation(false);
    if (onArchiveAll) {
      await onArchiveAll(emailIds);
    }
  }, [onArchiveAll, emailIds]);

  const handleCancelArchive = useCallback(() => {
    setShowArchiveConfirmation(false);
  }, []);

  const handleReanalyseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReanalyseOther && !isReanalysingOther) {
      onReanalyseOther();
    }
  };

  useEffect(() => {
    if (!showArchiveConfirmation) return;
    const handleKeyDown = makeArchiveKeyDownHandler(handleConfirmArchive, handleCancelArchive);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showArchiveConfirmation, handleConfirmArchive, handleCancelArchive]);

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <div
        onClick={onToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          cursor: 'pointer',
          backgroundColor: isHovered ? theme.colors.interactive.hover : theme.colors.background.paper,
          transition: theme.transitions.fast,
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderRadius: isExpanded ? `${theme.borderRadius.lg} ${theme.borderRadius.lg} 0 0` : theme.borderRadius.lg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <span
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: theme.transitions.fast,
              fontSize: theme.typography.fontSize.lg,
              color: theme.colors.text.secondary,
            }}
          >
            ▶
          </span>
          <span style={{ fontSize: '1.25rem' }}>{getCategoryIcon(category)}</span>
          <span
            style={{
              fontWeight: theme.typography.fontWeight.semibold,
              fontSize: theme.typography.fontSize.base,
              color: theme.colors.text.primary,
            }}
          >
            {isDefaultCategory(category) ? t(getCategoryTranslationKey(category) as string) : category}
          </span>
          <span
            style={{
              backgroundColor: theme.colors.greyscale[300],
              color: theme.colors.text.secondary,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.full,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          >
            {emailCount}
          </span>
          <button
            onClick={handleEditCategoryClick}
            onMouseEnter={() => setIsPencilHovered(true)}
            onMouseLeave={() => setIsPencilHovered(false)}
            style={{
              padding: theme.spacing.xs,
              borderRadius: theme.borderRadius.sm,
              border: STRING_NONE,
              backgroundColor: isPencilHovered ? theme.colors.interactive.hover : 'transparent',
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              cursor: 'pointer',
              transition: theme.transitions.fast,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={t('inbox.category.editCategories')}
          >
            {EDIT_ICON}
          </button>
          {isOtherCategory && onReanalyseOther && (
            <ReanalyseButton
              onClick={handleReanalyseClick}
              isReanalysing={Boolean(isReanalysingOther)}
              label={t('inbox.category.reanalyseCategories')}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          {onArchiveAll && emailCount > 0 && (
            <button
              onClick={handleArchiveAllClick}
              onMouseEnter={() => setIsArchiveAllHovered(true)}
              onMouseLeave={() => setIsArchiveAllHovered(false)}
              style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.sm,
                border: STRING_NONE,
                backgroundColor: isArchiveAllHovered ? theme.colors.interactive.hover : 'transparent',
                color: theme.colors.text.tertiary,
                fontSize: theme.typography.fontSize.sm,
                cursor: 'pointer',
                transition: theme.transitions.fast,
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
              title={t('inbox.category.archiveAllTooltip')}
            >
              <span>{ARCHIVE_ALL_ICON}</span>
              {t('inbox.category.archiveAll')}
            </button>
          )}
        </div>
      </div>

      {showArchiveConfirmation && (
        <ArchiveConfirmationToast
          emailCount={emailCount}
          onConfirm={handleConfirmArchive}
          onCancel={handleCancelArchive}
        />
      )}

      {isExpanded && (
        <div
          style={{
            padding: theme.spacing.md,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.md,
          }}
        >
          {isLoadingContent ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: theme.spacing.lg,
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              gap: theme.spacing.sm,
            }}>
              <div style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(128,128,128,0.3)',
                borderTopColor: 'currentColor',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              {t('inbox.category.loadingContent')}
            </div>
          ) : children}
        </div>
      )}
    </div>
  );
};

export interface CategoryGroup {
  category: string;
  emails: Email[];
  maxPriority: number;
}

export const groupEmailsByCategory = (
  emails: Email[],
  mode?: InboxMode,
): CategoryGroup[] => {
  const categoryMap = new Map<string, Email[]>();

  emails.forEach(email => {
    // Phishing emails are always bucketed into the dangerous category regardless of
    // their server-assigned category, so they are never buried in a regular inbox group.
    const isPhishing =
      email.phishingConfidence === PHISHING_CONFIDENCE_MEDIUM || email.phishingConfidence === PHISHING_CONFIDENCE_HIGH;
    const category = isPhishing
      ? CATEGORY_DANGEROUS_PHISHING
      : email.category || CATEGORY_OTHER;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(email);
  });

  const groups: CategoryGroup[] = [];
  categoryMap.forEach((categoryEmails, category) => {
    const sortedEmails = [...categoryEmails].sort((a, b) => {
      if (mode === MODE_AUTORESPONDED) {
        const autoRespondedA = a.autoRespondedAt
          ? new Date(a.autoRespondedAt).getTime()
          : 0;
        const autoRespondedB = b.autoRespondedAt
          ? new Date(b.autoRespondedAt).getTime()
          : 0;
        if (autoRespondedB !== autoRespondedA) {
          return autoRespondedB - autoRespondedA;
        }
      }

      const priorityA = getEmailPriorityScore(a);
      const priorityB = getEmailPriorityScore(b);
      return priorityB - priorityA;
    });

    const maxPriority = sortedEmails.length > 0 ? getEmailPriorityScore(sortedEmails[0]) : 0;

    groups.push({
      category,
      emails: sortedEmails,
      maxPriority,
    });
  });

  groups.sort((a, b) => b.maxPriority - a.maxPriority);

  return groups;
};
