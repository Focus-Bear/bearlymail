/**
 * MobileAssistantSheet — the mobile home for the email's "extra tools" and the
 * Ask AI chat bot (issue #144).
 *
 * On mobile the assistant/context cards (Deals, Sender Context, summary, tasks,
 * notes, scheduling) used to stack inline below the email, burying the message.
 * Here they move behind a floating button that opens a bottom sheet with two
 * tabs — Actions (the same cards the desktop split-view sidebar shows) and Ask
 * AI (the chat bot, previously desktop-only). The reading view stays clean and
 * the tools are one tap away.
 *
 * Presentational: both tab bodies are injected by the parent (EmailDetail), so
 * all email-detail state wiring stays there — mirroring ActionSidebar.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiList, FiX, FiZap } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { TOUCH_TARGET_MIN_PX } from 'constants/layout';
import { KEY_ESCAPE, STRING_NONE } from 'constants/strings';

const TAB_ACTIONS = 'actions';
const TAB_ASK_AI = 'askAi';
type SheetTab = typeof TAB_ACTIONS | typeof TAB_ASK_AI;

interface MobileAssistantSheetProps {
  /** Body of the "Actions" tab — the assistant/context cards. */
  actionsContent: React.ReactNode;
  /** Body of the "Ask AI" tab — the chat bot. */
  askAiContent: React.ReactNode;
}

interface SheetTabButtonProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const SheetTabButton: React.FC<SheetTabButtonProps> = ({ active, label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    role="tab"
    aria-selected={active}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.xs,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      minHeight: `${TOUCH_TARGET_MIN_PX}px`,
      backgroundColor: COLOR_TRANSPARENT,
      border: STRING_NONE,
      borderBottom: `2px solid ${active ? theme.colors.primary.main : COLOR_TRANSPARENT}`,
      color: active ? theme.colors.text.primary : theme.colors.text.tertiary,
      fontSize: theme.typography.fontSize.lg,
      fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
      cursor: 'pointer',
    }}
  >
    {icon}
    {label}
  </button>
);

interface AssistantSheetOverlayProps {
  activeTab: SheetTab;
  onSelectTab: (tab: SheetTab) => void;
  onClose: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  actionsContent: React.ReactNode;
  askAiContent: React.ReactNode;
}

const AssistantSheetOverlay: React.FC<AssistantSheetOverlayProps> = ({
  activeTab,
  onSelectTab,
  onClose,
  closeButtonRef,
  actionsContent,
  askAiContent,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('inbox.assistant.ariaLabel')}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.colors.background.paper,
          borderTopLeftRadius: theme.borderRadius.xl,
          borderTopRightRadius: theme.borderRadius.xl,
          boxShadow: theme.shadows.xl,
          zIndex: 2001,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div
          role="tablist"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: `0 ${theme.spacing.sm}`,
            borderBottom: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <SheetTabButton
            active={activeTab === TAB_ACTIONS}
            label={t('inbox.assistant.actionsTab')}
            icon={<FiList size={15} />}
            onClick={() => onSelectTab(TAB_ACTIONS)}
          />
          <SheetTabButton
            active={activeTab === TAB_ASK_AI}
            label={t('inbox.assistant.askAiTab')}
            icon={<FiZap size={15} />}
            onClick={() => onSelectTab(TAB_ASK_AI)}
          />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('inbox.assistant.close')}
            title={t('inbox.assistant.close')}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${TOUCH_TARGET_MIN_PX}px`,
              height: `${TOUCH_TARGET_MIN_PX}px`,
              backgroundColor: COLOR_TRANSPARENT,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.sm,
              color: theme.colors.text.tertiary,
              cursor: 'pointer',
            }}
          >
            <FiX size={20} />
          </button>
        </div>
        <div
          role="tabpanel"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: theme.spacing.md,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {activeTab === TAB_ACTIONS ? actionsContent : askAiContent}
        </div>
      </div>
    </>
  );
};

export const MobileAssistantSheet: React.FC<MobileAssistantSheetProps> = ({ actionsContent, askAiContent }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SheetTab>(TAB_ACTIONS);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((tab: SheetTab) => {
    setActiveTab(tab);
    setIsOpen(true);
  }, []);

  // Close and hand focus back to the launcher so keyboard users aren't dropped
  // at the top of the page.
  const close = useCallback(() => {
    setIsOpen(false);
    fabRef.current?.focus();
  }, []);

  // While open, move focus into the sheet and let Escape close it.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, close]);

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        onClick={() => open(TAB_ACTIONS)}
        aria-label={t('inbox.assistant.openMobile')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        style={{
          position: 'fixed',
          right: theme.spacing.md,
          bottom: `calc(${theme.spacing.lg} + env(safe-area-inset-bottom, 0px))`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          minHeight: `${TOUCH_TARGET_MIN_PX}px`,
          padding: `0 ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.xl,
          boxShadow: theme.shadows.lg,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: 'pointer',
          zIndex: 1400,
        }}
      >
        <FiZap size={18} />
        {t('inbox.assistant.openMobile')}
      </button>

      {isOpen && (
        <AssistantSheetOverlay
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onClose={close}
          closeButtonRef={closeButtonRef}
          actionsContent={actionsContent}
          askAiContent={askAiContent}
        />
      )}
    </>
  );
};
