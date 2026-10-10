import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ArchiveConfirmationToast } from 'components/inbox/ArchiveConfirmationToast';
import { EMOJI_ARCHIVE } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';
import { KEY_ESCAPE, KEY_Y, KEY_Y_UPPERCASE, STRING_NONE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

const ARCHIVE_ALL_ICON = EMOJI_ARCHIVE;

// Static style constants — outside component to avoid recreation on each render
const containerStyle: React.CSSProperties = {
  marginLeft: theme.spacing.lg,
  borderRadius: theme.borderRadius.md,
  border: `1px solid ${theme.colors.border.light}`,
  backgroundColor: theme.colors.background.subtle,
};

const contentColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.xs,
  flex: 1,
  minWidth: 0,
};

const contentRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  minWidth: 0,
};

const categoryNameStyle: React.CSSProperties = {
  fontWeight: theme.typography.fontWeight.medium,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
  // Let the name shrink and wrap at word/character boundaries. Without this a
  // long name in a narrow (mobile) column wrapped one letter per line (#146).
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const emailCountBadgeStyle: React.CSSProperties = {
  backgroundColor: theme.colors.greyscale[300],
  color: theme.colors.text.secondary,
  padding: `2px ${theme.spacing.xs}`,
  borderRadius: theme.borderRadius.full,
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.medium,
  flexShrink: 0,
};

const descriptionStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.tertiary,
  fontStyle: 'italic',
  paddingLeft: '1.5rem',
};

function getActionsContainerStyle(isMobile: boolean): React.CSSProperties {
  return {
    display: 'flex',
    gap: theme.spacing.sm,
    // Desktop: keep the buttons on one line beside the name. Mobile: they sit on
    // their own full-width row below the name (header goes column, see
    // getHeaderStyle), so allow them to wrap and hug the right edge instead of
    // squeezing the name column to a sliver (#146).
    flexShrink: 0,
    ...(isMobile ? { flexWrap: 'wrap', justifyContent: 'flex-end' } : {}),
  };
}

const childrenContainerStyle: React.CSSProperties = {
  padding: theme.spacing.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
};

// Dynamic style helpers — accept state values to avoid inline ternaries in JSX
function getHeaderStyle(isExpanded: boolean, isMobile: boolean): React.CSSProperties {
  return {
    display: 'flex',
    // Mobile stacks the name/description above the action buttons so the text
    // gets the full width; desktop keeps them side by side (#146).
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'stretch' : 'center',
    justifyContent: 'space-between',
    gap: isMobile ? theme.spacing.sm : 0,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    cursor: 'pointer',
    borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
    borderRadius: isExpanded ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0` : theme.borderRadius.md,
  };
}

function getChevronStyle(isExpanded: boolean): React.CSSProperties {
  return {
    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
    transition: theme.transitions.fast,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text.secondary,
    flexShrink: 0,
  };
}

function getArchiveButtonStyle(isArchiveAllHovered: boolean, isBusy: boolean): React.CSSProperties {
  return {
    background: isArchiveAllHovered ? theme.colors.interactive.hover : 'transparent',
    border: STRING_NONE,
    color: theme.colors.text.tertiary,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    opacity: isBusy ? OPACITY_DISABLED : 1,
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
  };
}

function getConvertButtonStyle(isBusy: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${theme.colors.primary.main}`,
    color: theme.colors.primary.main,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    opacity: isBusy ? OPACITY_DISABLED : 1,
    whiteSpace: 'nowrap',
  };
}

function getDeleteButtonStyle(isBusy: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${theme.colors.accent.error}`,
    color: theme.colors.accent.error,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.medium,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    opacity: isBusy ? OPACITY_DISABLED : 1,
    whiteSpace: 'nowrap',
  };
}

interface ProtoCategorySubAccordionProps {
  name: string;
  description?: string | null;
  emailCount: number;
  children: React.ReactNode;
  onConvertToCategory: () => Promise<void>;
  isConverting: boolean;
  onArchiveAll?: (emailIds: string[]) => Promise<void>;
  emailIds?: string[];
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
}

function makeProtoKeyDownHandler(onConfirm: () => void, onCancel: () => void): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key === KEY_Y || event.key === KEY_Y_UPPERCASE) {
      event.stopPropagation();
      onConfirm();
    } else if (event.key === KEY_ESCAPE) {
      event.stopPropagation();
      onCancel();
    }
  };
}

export const ProtoCategorySubAccordion: React.FC<ProtoCategorySubAccordionProps> = ({
  name,
  description,
  emailCount,
  children,
  onConvertToCategory,
  isConverting,
  onArchiveAll,
  emailIds = [],
  onDelete,
  isDeleting,
}) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isArchiveAllHovered, setIsArchiveAllHovered] = useState(false);
  const [showArchiveConfirmation, setShowArchiveConfirmation] = useState(false);
  const isBusy = isConverting || Boolean(isDeleting);

  const handleArchiveAllClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!isBusy && onArchiveAll && emailIds.length > 0) {
      setShowArchiveConfirmation(true);
    }
  };

  const handleConfirmArchive = useCallback(async () => {
    setShowArchiveConfirmation(false);
    if (onArchiveAll && emailIds.length > 0) {
      await onArchiveAll(emailIds);
      // Collapse this proto-category group after archiving all emails so the UI doesn't leave
      // an empty expanded group visible.
      setIsExpanded(false);
    }
  }, [onArchiveAll, emailIds]);

  const handleCancelArchive = useCallback(() => {
    setShowArchiveConfirmation(false);
  }, []);

  useEffect(() => {
    if (!showArchiveConfirmation) {
      return;
    }
    const handleKeyDown = makeProtoKeyDownHandler(handleConfirmArchive, handleCancelArchive);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showArchiveConfirmation, handleConfirmArchive, handleCancelArchive]);

  return (
    <div style={containerStyle}>
      <div onClick={() => setIsExpanded(!isExpanded)} style={getHeaderStyle(isExpanded, isMobile)}>
        <div style={contentColumnStyle}>
          <div style={contentRowStyle}>
            <span style={getChevronStyle(isExpanded)}>▶</span>
            <span style={categoryNameStyle}>{name}</span>
            <span style={emailCountBadgeStyle}>{emailCount}</span>
          </div>
          {description && <span style={descriptionStyle}>{description}</span>}
        </div>
        <div style={getActionsContainerStyle(isMobile)} onClick={event => event.stopPropagation()}>
          {onArchiveAll && emailCount > 0 && (
            <button
              onClick={handleArchiveAllClick}
              onMouseEnter={() => setIsArchiveAllHovered(true)}
              onMouseLeave={() => setIsArchiveAllHovered(false)}
              disabled={isBusy}
              style={getArchiveButtonStyle(isArchiveAllHovered, isBusy)}
              title={t('inbox.category.archiveAllTooltip')}
            >
              <span>{ARCHIVE_ALL_ICON}</span>
              {t('inbox.category.archiveAll')}
            </button>
          )}
          <button onClick={onConvertToCategory} disabled={isBusy} style={getConvertButtonStyle(isBusy)}>
            {isConverting ? t('inbox.protoCategory.converting') : t('inbox.protoCategory.convertToCategory')}
          </button>
          {onDelete && (
            <button onClick={onDelete} disabled={isBusy} style={getDeleteButtonStyle(isBusy)}>
              {isDeleting ? t('settings.protoCategories.deleting') : t('settings.protoCategories.delete')}
            </button>
          )}
        </div>
      </div>
      {isExpanded && <div style={childrenContainerStyle}>{children}</div>}
      {showArchiveConfirmation && (
        <ArchiveConfirmationToast
          emailCount={emailCount}
          onConfirm={handleConfirmArchive}
          onCancel={handleCancelArchive}
        />
      )}
    </div>
  );
};
