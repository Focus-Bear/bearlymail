import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED } from 'constants/numbers';

interface ProtoCategorySubAccordionProps {
  name: string;
  description?: string | null;
  emailCount: number;
  children: React.ReactNode;
  onConvertToCategory: () => Promise<void>;
  isConverting: boolean;
  onDelete?: () => Promise<void>;
  isDeleting?: boolean;
}

export const ProtoCategorySubAccordion: React.FC<ProtoCategorySubAccordionProps> = ({
  name,
  description,
  emailCount,
  children,
  onConvertToCategory,
  isConverting,
  onDelete,
  isDeleting,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const isBusy = isConverting || (isDeleting ?? false);

  return (
    <div
      style={{
        marginLeft: theme.spacing.lg,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          cursor: 'pointer',
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
          borderRadius: isExpanded
            ? `${theme.borderRadius.md} ${theme.borderRadius.md} 0 0`
            : theme.borderRadius.md,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
            <span
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: theme.transitions.fast,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                flexShrink: 0,
              }}
            >
              ▶
            </span>
            <span
              style={{
                fontWeight: theme.typography.fontWeight.medium,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
              }}
            >
              {name}
            </span>
            <span
              style={{
                backgroundColor: theme.colors.greyscale[300],
                color: theme.colors.text.secondary,
                padding: `2px ${theme.spacing.xs}`,
                borderRadius: theme.borderRadius.full,
                fontSize: theme.typography.fontSize.xs,
                fontWeight: theme.typography.fontWeight.medium,
                flexShrink: 0,
              }}
            >
              {emailCount}
            </span>
          </div>
          {description && (
            <span
              style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
                fontStyle: 'italic',
                paddingLeft: '1.5rem',
              }}
            >
              {description}
            </span>
          )}
        </div>
        <div
          style={{ display: 'flex', gap: theme.spacing.sm, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onConvertToCategory}
            disabled={isBusy}
            style={{
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
            }}
          >
            {isConverting
              ? t('inbox.protoCategory.converting')
              : t('inbox.protoCategory.convertToCategory')}
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={isBusy}
              style={{
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
              }}
            >
              {isDeleting
                ? t('settings.protoCategories.deleting')
                : t('settings.protoCategories.delete')}
            </button>
          )}
        </div>
      </div>
      {isExpanded && (
        <div
          style={{
            padding: theme.spacing.sm,
            display: 'flex',
            flexDirection: 'column',
            gap: theme.spacing.sm,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
