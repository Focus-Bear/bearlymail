import React, { useEffect } from 'react';
import { Email } from 'types/email';

import { KEY_ARROW_DOWN, KEY_ARROW_UP, KEY_ENTER, KEY_ESCAPE, KEY_TAB } from 'constants/strings';
import { useSplitView } from 'hooks/useSplitView';

interface UseInboxKeyboardNavigationProps {
  emails: Email[];
  selectedEmailIndex: number;
  setSelectedEmailIndex: (index: number) => void;
  splitView: ReturnType<typeof useSplitView>;
  onEmailSelect: (emailId: string, event: React.MouseEvent | KeyboardEvent) => void;
  emailListRef: React.RefObject<HTMLDivElement | null>;
  emailDetailRef: React.RefObject<HTMLDivElement | null>;
}

export function useInboxKeyboardNavigation({
  emails,
  selectedEmailIndex,
  setSelectedEmailIndex,
  splitView,
  onEmailSelect,
  emailListRef,
  emailDetailRef,
}: UseInboxKeyboardNavigationProps) {
  useEffect(() => {
    if (splitView.isMobile) {
      return;
    }

// eslint-disable-next-line complexity,max-statements -- pre-existing: complex keyboard handler with many conditional branches
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE && splitView.selectedEmailId) {
        splitView.closeEmail();
        emailListRef.current?.focus();
        return;
      }

      if (event.key === KEY_TAB && !event.shiftKey && document.activeElement) {
        const activeEl = document.activeElement;
        const isInList = emailListRef.current?.contains(activeEl);
        const isInDetail = emailDetailRef.current?.contains(activeEl);

        if (isInList && splitView.selectedEmailId && !isInDetail) {
          const focusableInList = emailListRef.current?.querySelectorAll(
            'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableInList && focusableInList.length > 0) {
            const lastFocusable = focusableInList[focusableInList.length - 1] as HTMLElement;
            if (activeEl === lastFocusable || activeEl === emailListRef.current) {
              event.preventDefault();
              const firstFocusableInDetail = emailDetailRef.current?.querySelector(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
              ) as HTMLElement;
              firstFocusableInDetail?.focus();
            }
          }
        }
      }

      if (event.key === KEY_TAB && event.shiftKey && document.activeElement) {
        const activeEl = document.activeElement;
        const isInList = emailListRef.current?.contains(activeEl);
        const isInDetail = emailDetailRef.current?.contains(activeEl);

        if (isInDetail && !isInList) {
          const focusableInDetail = emailDetailRef.current?.querySelectorAll(
            'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableInDetail && focusableInDetail.length > 0) {
            const firstFocusable = focusableInDetail[0] as HTMLElement;
            if (activeEl === firstFocusable) {
              event.preventDefault();
              const lastFocusableInList = emailListRef.current?.querySelector(
                'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
              ) as HTMLElement;
              lastFocusableInList?.focus();
            }
          }
        }
      }

      if (emailListRef.current?.contains(document.activeElement)) {
        const visibleEmails = emails.filter(event => !event.isArchived);
        if (event.key === KEY_ARROW_DOWN && selectedEmailIndex < visibleEmails.length - 1) {
          event.preventDefault();
          const newIndex = selectedEmailIndex + 1;
          setSelectedEmailIndex(newIndex);
          // Scroll the newly selected email into view
          setTimeout(() => {
            const emailElement = emailListRef.current?.querySelector(`[data-email-index="${newIndex}"]`) as HTMLElement;
            if (emailElement) {
              emailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 0);
        } else if (event.key === KEY_ARROW_UP && selectedEmailIndex > 0) {
          event.preventDefault();
          const newIndex = selectedEmailIndex - 1;
          setSelectedEmailIndex(newIndex);
          // Scroll the newly selected email into view
          setTimeout(() => {
            const emailElement = emailListRef.current?.querySelector(`[data-email-index="${newIndex}"]`) as HTMLElement;
            if (emailElement) {
              emailElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 0);
        } else if (event.key === KEY_ENTER && selectedEmailIndex >= 0 && visibleEmails[selectedEmailIndex]) {
          event.preventDefault();
          onEmailSelect(visibleEmails[selectedEmailIndex].id, event);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [splitView, selectedEmailIndex, emails, setSelectedEmailIndex, onEmailSelect, emailListRef, emailDetailRef]);
}
