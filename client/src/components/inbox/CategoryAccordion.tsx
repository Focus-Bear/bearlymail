import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore, InboxMode } from 'types/email';

import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { OPACITY_DISABLED } from 'constants/numbers';
import {
  CATEGORY_DANGEROUS_PHISHING,
  CATEGORY_OTHER,
  KEY_ESCAPE,
  KEY_Y,
  MODE_AUTORESPONDED,
  PHISHING_CONFIDENCE_HIGH,
  PHISHING_CONFIDENCE_MEDIUM,
  STRING_NONE,
} from 'constants/strings';

import {
  DEFAULT_CATEGORY_TRANSLATIONS,
  getCategoryIcon,
  getCategoryTranslationKey,
  isDefaultCategory,
  makeArchiveKeyDownHandler,
} from './categoryAccordion.helpers';

interface CategoryAccordionProps {
  category: string;
  /** Stable key used as the `data-category-key` DOM attribute for scroll targeting */
  categoryKey?: string;
  emails: Email[];
  /** Total count from the inbox summary (shown in badge even before emails are loaded) */
  count?: number;
  /** True while the category emails are being fetched for the first time */
  isLoadingContent?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onArchiveAll?: (category: string, emailIds: string[]) => Promise<void>;
  children: React.ReactNode;
  onReanalyseOther?: () => void;
  isReanalysingOther?: boolean;
  /** Called after the accordion collapses (either via archive-all or auto-collapse). Used to scroll the next category into view. */
  onAfterCollapse?: () => void;
  /** Called when the user clicks the ⚙️ settings button for this category. */
  onNavigateToSettings?: () => void;
}



const EDIT_ICON = '⚙️';

const REANALYSE_ICON = '🔄';

const ARCHIVE_ALL_ICON = '🗄️';

interface ReanalyseButtonProps {
  onClick: (event: React.MouseEvent) => void;
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
      <span style={{ animation: isReanalysing ? 'spin 1s linear infinite' : 'none' }}>{REANALYSE_ICON}</span>
      {label}
    </button>
  );
};



interface CategoryAccordionHeaderProps {
  category: string;
  emailCount: number;
  isExpanded: boolean;
  isOtherCategory: boolean;
  isReanalysingOther?: boolean;
  hasArchiveAll: boolean;
  onToggle: () => void;
  onEditCategoryClick: (event: React.MouseEvent) => void;
  onReanalyseClick: (event: React.MouseEvent) => void;
  onArchiveAllClick: (event: React.MouseEvent) => void;
  onReanalyseOther?: () => void;
  t: (tKey: string) => string;
}

interface CategoryHeaderLeftProps {
  category: string;
  emailCount: number;
  isExpanded: boolean;
  isOtherCategory: boolean;
  isReanalysingOther?: boolean;
  onEditCategoryClick: (event: React.MouseEvent) => void;
  onReanalyseClick: (event: React.MouseEvent) => void;
  onReanalyseOther?: () => void;
  t: (tKey: string) => string;
}

const CategoryHeaderLeft: React.FC<CategoryHeaderLeftProps> = ({
  category,
  emailCount,
  isExpanded,
  isOtherCategory,
  isReanalysingOther,
  onEditCategoryClick,
  onReanalyseClick,
  onReanalyseOther,
  t,
}) => {
  const [isPencilHovered, setIsPencilHovered] = useState(false);
  return (
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
          onClick={onEditCategoryClick}
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
          onClick={onReanalyseClick}
          isReanalysing={Boolean(isReanalysingOther)}
          label={t('inbox.category.reanalyseCategories')}
        />
      )}
    </div>
  );
};

const CategoryAccordionHeader: React.FC<CategoryAccordionHeaderProps> = ({
  category,
  emailCount,
  isExpanded,
  isOtherCategory,
  isReanalysingOther,
  hasArchiveAll,
  onToggle,
  onEditCategoryClick,
  onReanalyseClick,
  onArchiveAllClick,
  onReanalyseOther,
  t,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isArchiveAllHovered, setIsArchiveAllHovered] = useState(false);
  return (
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
      <CategoryHeaderLeft
        category={category}
        emailCount={emailCount}
        isExpanded={isExpanded}
        isOtherCategory={isOtherCategory}
        isReanalysingOther={isReanalysingOther}
        onEditCategoryClick={onEditCategoryClick}
        onReanalyseClick={onReanalyseClick}
        onReanalyseOther={onReanalyseOther}
        t={t}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        {hasArchiveAll && emailCount > 0 && (
          <button
            onClick={onArchiveAllClick}
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
  );
};

interface CategoryAccordionContentProps {
  isLoadingContent?: boolean;
  loadingLabel: string;
  children: React.ReactNode;
}

const CategoryAccordionContent: React.FC<CategoryAccordionContentProps> = ({
  isLoadingContent,
  loadingLabel,
  children,
}) => (
  <div style={{ padding: theme.spacing.md, display: 'flex', flexDirection: 'column', gap: theme.spacing.md, minWidth: 0 }}>
    {isLoadingContent ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.lg,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          gap: theme.spacing.sm,
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            border: '2px solid rgba(128,128,128,0.3)',
            borderTopColor: 'currentColor',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        {loadingLabel}
      </div>
    ) : (
      children
    )}
  </div>
);

export const CategoryAccordion: React.FC<CategoryAccordionProps> = ({
  category,
  categoryKey,
  emails,
  count,
  isLoadingContent,
  isExpanded,
  onToggle,
  onArchiveAll,
  children,
  onReanalyseOther,
  isReanalysingOther,
  onAfterCollapse,
  onNavigateToSettings,
}) => {
  const { t } = useTranslation();
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);
  const emailCount = count !== undefined ? count : emails.length;
  const emailIds = emails.map(event => event.id);
  const isOtherCategory = category === CATEGORY_OTHER;

  // Auto-collapse is handled entirely by the parent (InboxCategoryItem) which has
  // better context: it checks both isLoaded and categoryItem.count before collapsing,
  // preventing a race condition where this effect and the parent both call onToggle()
  // in the same render cycle, leaving the accordion stuck in an unexpected state.
  // See fix #1245.

  const handleEditCategoryClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    onNavigateToSettings?.();
  };

  const handleArchiveAllClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (emailCount > 0) {
      setShowArchiveConfirmation(true);
    }
  };

  const handleConfirmArchive = useCallback(async () => {
    setShowArchiveConfirmation(false);
    if (onArchiveAll) {
      await onArchiveAll(category, emailIds);
      // After archiving all emails in this category, collapse it so the user returns to the list
      // without an empty expanded accordion.
      onToggle();
      onAfterCollapse?.();
    }
  }, [onArchiveAll, category, emailIds, onToggle, onAfterCollapse]);

  const handleCancelArchive = useCallback(() => {
    setShowArchiveConfirmation(false);
  }, []);

  const handleReanalyseClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (onReanalyseOther && !isReanalysingOther) {
      onReanalyseOther();
    }
  };

  useEffect(() => {
    if (!showArchiveConfirmation) {
      return;
    }
    const keyHandler = makeArchiveKeyDownHandler(handleConfirmArchive, handleCancelArchive);
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [showArchiveConfirmation, handleConfirmArchive, handleCancelArchive]);

  return (
    <div
      data-category-key={categoryKey ?? category}
      style={{
        marginBottom: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <CategoryAccordionHeader
        category={category}
        emailCount={emailCount}
        isExpanded={isExpanded}
        isOtherCategory={isOtherCategory}
        isReanalysingOther={isReanalysingOther}
        hasArchiveAll={Boolean(onArchiveAll)}
        onToggle={onToggle}
        onEditCategoryClick={handleEditCategoryClick}
        onReanalyseClick={handleReanalyseClick}
        onArchiveAllClick={handleArchiveAllClick}
        onReanalyseOther={onReanalyseOther}
        t={t}
      />
      {showArchiveConfirmation && (
        <ArchiveConfirmationToast
          emailCount={emailCount}
          onConfirm={handleConfirmArchive}
          onCancel={handleCancelArchive}
        />
      )}
      {/*
       * CSS grid trick for smooth height animation without knowing the element's
       * exact pixel height. Transitioning grid-template-rows from '1fr' to '0fr'
       * (with overflow:hidden and minHeight:0 on the inner div) produces a smooth
       * collapse/expand in both directions without JavaScript height calculations.
       */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.25s ease-out',
          overflow: 'hidden',
        }}
      >
        <div style={{ minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
          <CategoryAccordionContent isLoadingContent={isLoadingContent} loadingLabel={t('inbox.category.loadingContent')}>
            {children}
          </CategoryAccordionContent>
        </div>
      </div>
    </div>
  );
};

export interface CategoryGroup {
  category: string;
  emails: Email[];
  maxPriority: number;
}

export const groupEmailsByCategory = (emails: Email[], mode?: InboxMode): CategoryGroup[] => {
  const categoryMap = new Map<string, Email[]>();

  emails.forEach(email => {
    const isPhishing =
      email.phishingConfidence === PHISHING_CONFIDENCE_MEDIUM || email.phishingConfidence === PHISHING_CONFIDENCE_HIGH;
    // If the server has assigned a specific category (not "Other"), respect it even when
    // the phishing classifier fires. Fundraising or investor emails can trigger medium/high
    // phishing confidence while still having a valid server-assigned category — in those
    // cases we should NOT override the category. Only route to the phishing bucket when
    // the email has no server-assigned category (or is already in "Other").
    const hasServerCategory = Boolean(email.category_id) && email.category_id !== CATEGORY_OTHER;
    // Use category_id (UUID) as the stable group key when provided by the server.
    // This avoids encoding/whitespace mismatches with the summary's UUID-based keys.
    // Falls back to the category name string for auto-responded and legacy emails.
    const categoryKey =
      isPhishing && !hasServerCategory
        ? CATEGORY_DANGEROUS_PHISHING
        : email.category_id ?? email.category ?? CATEGORY_OTHER;
    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, []);
    }
    categoryMap.get(categoryKey)!.push(email);
  });

  const groups: CategoryGroup[] = [];
  categoryMap.forEach((categoryEmails, category) => {
    const sortedEmails = [...categoryEmails].sort((itemA, itemB) => {
      if (mode === MODE_AUTORESPONDED) {
        const autoRespondedA = itemA.autoRespondedAt ? new Date(itemA.autoRespondedAt).getTime() : 0;
        const autoRespondedB = itemB.autoRespondedAt ? new Date(itemB.autoRespondedAt).getTime() : 0;
        if (autoRespondedB !== autoRespondedA) {
          return autoRespondedB - autoRespondedA;
        }
      }

      const priorityA = getEmailPriorityScore(itemA);
      const priorityB = getEmailPriorityScore(itemB);
      return priorityB - priorityA;
    });

    const maxPriority = sortedEmails.length > 0 ? getEmailPriorityScore(sortedEmails[0]) : 0;

    groups.push({ category, emails: sortedEmails, maxPriority });
  });

  groups.sort((itemA, itemB) => itemB.maxPriority - itemA.maxPriority);

  return groups;
};
