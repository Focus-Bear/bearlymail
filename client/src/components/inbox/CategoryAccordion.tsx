import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArchive } from 'react-icons/fi';
import { type EventData, EVENTS, Joyride, STATUS, type Step } from 'react-joyride';
import { theme } from 'theme/theme';
import { Email, getEmailPriorityScore, InboxMode } from 'types/email';
import { createCategoryArchiveWorkflow } from 'utils/categoryArchiveWorkflow';
import { categorySettingsUrl } from 'utils/settingsNavigation';

import { OverflowMenu, OverflowMenuItem } from 'components/common/OverflowMenu';
import { ConfirmModal } from 'components/ConfirmModal';
import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import {
  CATEGORY_DANGEROUS_PHISHING,
  CATEGORY_NEWSLETTERS,
  CATEGORY_OTHER,
  INBOX_ARCHIVE_ALL_CATEGORY_EVENT,
  MODE_AUTORESPONDED,
  PHISHING_CONFIDENCE_HIGH,
  PHISHING_CONFIDENCE_MEDIUM,
  STRING_NONE,
} from 'constants/strings';
import { useNotifications } from 'contexts/NotificationContext';
import { getCategoryKey } from 'hooks/useEmailFetching';

import {
  getCategoryIcon,
  getCategoryTranslationKey,
  isDefaultCategory,
  makeArchiveKeyDownHandler,
} from './categoryAccordion.helpers';

interface CategoryAccordionProps {
  category: string;
  /** The category's UUID (null for the Other bucket and legacy name-keyed groups). Enables the auto-archive workflow action. */
  categoryId?: string | null;
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
  /** True when the category fetch has fired a slow-fetch warning (approaching or over budget). */
  isNearBudget?: boolean;
}


const EDIT_ICON = '⚙️';
const REANALYSE_ICON = '🔄';

const NEWSLETTER_BLOCK_TIP_DISMISSED_KEY = 'bearlymail_newsletter_block_tip_dismissed';
const NEWSLETTER_BLOCK_TIP_DISMISSED_VALUE = 'true';
const BLOCK_SENDER_TOUR_TARGET = '[data-tour="block-sender"]';
const BLOCK_SENDER_TOUR_POLL_MS = 200;
const BLOCK_SENDER_TOUR_TIMEOUT_MS = 5000;

const NewsletterBlockTip: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => {
  const { t } = useTranslation();
  const [isDismissed, setIsDismissed] = useState(
    () => localStorage.getItem(NEWSLETTER_BLOCK_TIP_DISMISSED_KEY) === NEWSLETTER_BLOCK_TIP_DISMISSED_VALUE
  );
  // The block button only renders for newsletters that have no unsubscribe link, and the
  // accordion's email rows mount a beat after this tip. Wait for the target to exist so
  // Joyride can anchor the spotlight; bail out after 5s if no email exposes the button.
  const [hasTarget, setHasTarget] = useState(false);

  const dismiss = useCallback(() => {
    localStorage.setItem(NEWSLETTER_BLOCK_TIP_DISMISSED_KEY, NEWSLETTER_BLOCK_TIP_DISMISSED_VALUE);
    setIsDismissed(true);
  }, []);

  useEffect(() => {
    if (isDismissed || !isExpanded) {
      return;
    }
    if (document.querySelector(BLOCK_SENDER_TOUR_TARGET)) {
      setHasTarget(true);
      return;
    }
    const interval = window.setInterval(() => {
      if (document.querySelector(BLOCK_SENDER_TOUR_TARGET)) {
        setHasTarget(true);
        window.clearInterval(interval);
      }
    }, BLOCK_SENDER_TOUR_POLL_MS);
    // If no email in this category exposes the block button within the budget, dismiss
    // permanently so we don't keep polling on every future expand.
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      dismiss();
    }, BLOCK_SENDER_TOUR_TIMEOUT_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [isDismissed, isExpanded, dismiss]);

  const handleEvent = useCallback(
    (data: EventData) => {
      const tourEnded = data.type === EVENTS.TOUR_END;
      const resolved = data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED;
      const targetMissing = data.type === EVENTS.TARGET_NOT_FOUND;
      if (tourEnded || resolved || targetMissing) {
        dismiss();
      }
    },
    [dismiss]
  );

  const steps: Step[] = useMemo(
    () => [
      {
        target: BLOCK_SENDER_TOUR_TARGET,
        title: t('inbox.category.newsletterBlockTipTitle'),
        content: t('inbox.category.newsletterBlockTip'),
        placement: 'top',
        skipBeacon: true,
        buttons: ['close'],
        closeButtonAction: 'skip',
        locale: { close: t('common.gotIt') },
      },
    ],
    [t]
  );

  if (isDismissed || !hasTarget) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={isExpanded}
      onEvent={handleEvent}
      options={{
        primaryColor: theme.colors.accent.warning,
        zIndex: 1000,
      }}
    />
  );
};

interface CategoryAccordionHeaderProps {
  category: string;
  emailCount: number;
  isExpanded: boolean;
  isOtherCategory: boolean;
  hasArchiveAll: boolean;
  /** Overflow (⋮) menu items for this category; the menu is hidden when empty. */
  overflowItems: OverflowMenuItem[];
  onToggle: () => void;
  onArchiveAllClick: (event: React.MouseEvent) => void;
  t: (tKey: string) => string;
}

interface CategoryHeaderLeftProps {
  category: string;
  emailCount: number;
  isExpanded: boolean;
  isOtherCategory: boolean;
  t: (tKey: string) => string;
}

const CategoryHeaderLeft: React.FC<CategoryHeaderLeftProps> = ({
  category,
  emailCount,
  isExpanded,
  isOtherCategory,
  t,
}) => {
  const [isCogHovered, setIsCogHovered] = useState(false);
  const displayName = isDefaultCategory(category) ? t(getCategoryTranslationKey(category) as string) : category;
  // Truncate the name with an ellipsis so a long name can't push the Archive-All action off-screen
  // (was cut off on mobile).
  const nameStyle: React.CSSProperties = {
    fontWeight: theme.typography.fontWeight.semibold,
    fontSize: theme.typography.fontSize.base,
    color: theme.colors.text.primary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, minWidth: 0, flex: 1 }}>
      <span
        style={{
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: theme.transitions.fast,
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.secondary,
          flexShrink: 0,
        }}
      >
        ▶
      </span>
      <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{getCategoryIcon(category)}</span>
      <span style={nameStyle}>{displayName}</span>
      <span
        style={{
          backgroundColor: theme.colors.greyscale[300],
          color: theme.colors.text.secondary,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.full,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.medium,
          flexShrink: 0,
        }}
      >
        {emailCount}
      </span>
      {/* The "Other" bucket isn't a real category, so it has no settings page to open —
          it offers the Recategorise action below instead of the cog. The cog is an anchor
          so middle-click/cmd-click work; it always opens settings in a new tab. */}
      {!isOtherCategory && (
        <a
          href={categorySettingsUrl(category)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => event.stopPropagation()}
          onMouseEnter={() => setIsCogHovered(true)}
          onMouseLeave={() => setIsCogHovered(false)}
          onFocus={() => setIsCogHovered(true)}
          onBlur={() => setIsCogHovered(false)}
          title={t('inbox.category.editCategories')}
          aria-label={t('inbox.category.editCategories')}
          style={{
            padding: theme.spacing.xs,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: isCogHovered ? theme.colors.interactive.hover : 'transparent',
            fontSize: theme.typography.fontSize.lg,
            textDecoration: 'none',
            transition: theme.transitions.fast,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {EDIT_ICON}
        </a>
      )}
    </div>
  );
};

const CategoryAccordionHeader: React.FC<CategoryAccordionHeaderProps> = ({
  category,
  emailCount,
  isExpanded,
  isOtherCategory,
  hasArchiveAll,
  overflowItems,
  onToggle,
  onArchiveAllClick,
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
        gap: theme.spacing.sm,
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
        t={t}
      />
      {hasArchiveAll && emailCount > 0 && (
        <button
          onClick={onArchiveAllClick}
          onMouseEnter={() => setIsArchiveAllHovered(true)}
          onMouseLeave={() => setIsArchiveAllHovered(false)}
          style={{
            flexShrink: 0,
            whiteSpace: 'nowrap',
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            borderRadius: theme.borderRadius.sm,
            border: STRING_NONE,
            backgroundColor: isArchiveAllHovered ? theme.colors.interactive.hover : 'transparent',
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.lg,
            cursor: 'pointer',
            transition: theme.transitions.fast,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
          title={t('inbox.category.archiveAllTooltip')}
        >
          <FiArchive size={15} />
          {t('inbox.category.archiveAll')}
        </button>
      )}
      {overflowItems.length > 0 && (
        <div onClick={event => event.stopPropagation()} style={{ flexShrink: 0, display: 'flex' }}>
          <OverflowMenu items={overflowItems} aria-label={t('inbox.category.moreActions')} />
        </div>
      )}
    </div>
  );
};

interface CategoryAccordionContentProps {
  isLoadingContent?: boolean;
  loadingLabel: string;
  /** Subtle amber indicator shown when the fetch is approaching the performance budget. */
  isNearBudget?: boolean;
  children: React.ReactNode;
}

const CategoryAccordionContent: React.FC<CategoryAccordionContentProps> = ({
  isLoadingContent,
  loadingLabel,
  isNearBudget,
  children,
}) => (
  <div
    style={{
      padding: theme.spacing.md,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.md,
      minWidth: 0,
      // Subtle amber left-border pulse when fetch is approaching budget (UX signal only, no alarm).
      borderLeft: isNearBudget && isLoadingContent ? `3px solid ${theme.colors.accent.warning}` : 'none',
      paddingLeft: isNearBudget && isLoadingContent ? `calc(${theme.spacing.md} - 3px)` : undefined,
    }}
  >
    {isLoadingContent ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.lg,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.lg,
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
  categoryId,
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
  isNearBudget,
}) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);
  const [showAutoArchiveConfirm, setShowAutoArchiveConfirm] = useState(false);
  const [isCreatingAutoArchive, setIsCreatingAutoArchive] = useState(false);
  const emailCount = count !== undefined ? count : emails.length;
  const emailIds = emails.map(event => event.id);
  const isOtherCategory = category === CATEGORY_OTHER;
  const isNewsletterCategory = category === CATEGORY_NEWSLETTERS;
  const displayName = isDefaultCategory(category) ? t(getCategoryTranslationKey(category) as string) : category;

  // Auto-collapse is handled entirely by the parent (InboxCategoryItem) which has
  // better context: it checks both isLoaded and categoryItem.count before collapsing,
  // preventing a race condition where this effect and the parent both call onToggle()
  // in the same render cycle, leaving the accordion stuck in an unexpected state.
  // See fix #1245.

  const handleArchiveAllClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (emailCount > 0) {
      setShowArchiveConfirmation(true);
    }
  };

  const handleConfirmArchive = useCallback(async () => {
    setShowArchiveConfirmation(false);
    if (onArchiveAll) {
      // Collapse FIRST so the accordion closes immediately on confirmation, before the
      // optimistic removal can unmount this component (which would make onToggle a no-op).
      onToggle();
      onAfterCollapse?.();
      await onArchiveAll(category, emailIds);
    }
  }, [onArchiveAll, category, emailIds, onToggle, onAfterCollapse]);

  const handleCancelArchive = useCallback(() => {
    setShowArchiveConfirmation(false);
  }, []);

  const handleConfirmAutoArchive = useCallback(async () => {
    if (!categoryId || isCreatingAutoArchive) {
      return;
    }
    setIsCreatingAutoArchive(true);
    try {
      await createCategoryArchiveWorkflow(
        categoryId,
        t('settings.categoryWorkflows.autoArchiveName', { category: displayName })
      );
      showSuccess(t('settings.categoryWorkflows.created', { category: displayName }));
    } catch {
      showError(t('settings.categoryWorkflows.createError'));
    } finally {
      setIsCreatingAutoArchive(false);
      setShowAutoArchiveConfirm(false);
    }
  }, [categoryId, isCreatingAutoArchive, displayName, t, showSuccess, showError]);

  // The Other bucket offers Recategorise (it has no settings/workflows); real
  // categories with a UUID offer the auto-archive workflow shortcut.
  const overflowItems: OverflowMenuItem[] = [];
  if (isOtherCategory && onReanalyseOther) {
    overflowItems.push({
      key: 'recategorise',
      label: isReanalysingOther ? t('inbox.category.reanalysingCategories') : t('inbox.category.reanalyseCategories'),
      icon: <span aria-hidden>{REANALYSE_ICON}</span>,
      onClick: () => {
        if (!isReanalysingOther) {
          onReanalyseOther();
        }
      },
    });
  }
  if (!isOtherCategory && categoryId) {
    overflowItems.push({
      key: 'auto-archive',
      label: t('inbox.category.autoArchiveMenuItem'),
      icon: <FiArchive size={14} aria-hidden />,
      onClick: () => setShowAutoArchiveConfirm(true),
    });
  }

  useEffect(() => {
    if (!showArchiveConfirmation) {
      return;
    }
    const keyHandler = makeArchiveKeyDownHandler(handleConfirmArchive, handleCancelArchive);
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [showArchiveConfirmation, handleConfirmArchive, handleCancelArchive]);

  // Arm the Archive-All confirmation when the Delete hotkey targets this (active, open) accordion —
  // see useCategoryArchiveAllHotkey. Mirrors clicking the Archive All button; the Y/Esc effect above
  // then handles confirm/cancel.
  const ownCategoryKey = categoryKey ?? category;
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ categoryKey: string }>).detail;
      if (!detail || detail.categoryKey !== ownCategoryKey) {
        return;
      }
      if (isExpanded && Boolean(onArchiveAll) && emailCount > 0) {
        setShowArchiveConfirmation(true);
      }
    };
    window.addEventListener(INBOX_ARCHIVE_ALL_CATEGORY_EVENT, handler);
    return () => window.removeEventListener(INBOX_ARCHIVE_ALL_CATEGORY_EVENT, handler);
  }, [ownCategoryKey, isExpanded, onArchiveAll, emailCount]);

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
        hasArchiveAll={Boolean(onArchiveAll)}
        overflowItems={overflowItems}
        onToggle={onToggle}
        onArchiveAllClick={handleArchiveAllClick}
        t={t}
      />
      <ConfirmModal
        isOpen={showAutoArchiveConfirm}
        title={t('inbox.category.autoArchiveConfirmTitle', { category: displayName })}
        message={t('inbox.category.autoArchiveConfirmMessage', { category: displayName })}
        confirmLabel={t('inbox.category.autoArchiveConfirmCta')}
        cancelLabel={t('common.cancel')}
        confirmColor={theme.colors.accent.warning}
        icon="🗂️"
        onConfirm={handleConfirmAutoArchive}
        onCancel={() => setShowAutoArchiveConfirm(false)}
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
          <CategoryAccordionContent isLoadingContent={isLoadingContent} loadingLabel={t('inbox.category.loadingContent')} isNearBudget={isNearBudget}>
            {isNewsletterCategory && <NewsletterBlockTip isExpanded={isExpanded} />}
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
    // Use getCategoryKey() to compute the stable group key — same logic used by
    // useEmailFetching's summary path. When category_id is null (Other/uncategorized
    // emails), getCategoryKey returns "uncategorized", matching the summary lookup key.
    // Falls back to the category name string for auto-responded and legacy emails.
    const categoryKey =
      isPhishing && !hasServerCategory
        ? CATEGORY_DANGEROUS_PHISHING
        : getCategoryKey(email.category_id, email.category ?? CATEGORY_OTHER);
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
