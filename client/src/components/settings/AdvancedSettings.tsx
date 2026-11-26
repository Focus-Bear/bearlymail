import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { useOpenForLinkedSection } from 'hooks/useOpenForLinkedSection';

interface AdvancedSettingsProps {
  /** Names what is inside, e.g. "Slot length and time zone". */
  summary: string;
  children: React.ReactNode;
}

/**
 * Rarely used settings, closed by default so each tab shows only the common
 * ones (#482). The contents stay mounted while closed, so links to a section
 * inside still find it and open this first.
 */
export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ summary, children }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(() => setIsOpen(true));
  const contentId = useId();
  useOpenForLinkedSection(contentRef, openRef.current);

  const Chevron = isOpen ? FiChevronDown : FiChevronRight;

  return (
    <section style={{ marginBottom: theme.spacing.xl }}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen(previous => !previous)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          width: '100%',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          border: `1px solid ${theme.colors.border.light}`,
          borderRadius: theme.borderRadius.md,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.primary,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Chevron aria-hidden size={18} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: theme.typography.fontWeight.semibold }}>{t('settings.advanced.title')}</span>
        <span
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>
      </button>
      <div id={contentId} ref={contentRef} hidden={!isOpen} style={{ paddingTop: theme.spacing.lg }}>
        {children}
      </div>
    </section>
  );
};
