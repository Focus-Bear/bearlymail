import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export interface ProjectStatusOption {
  id: string;
  name: string;
  color: string;
}

interface ProjectStatusSelectorProps {
  /** Available project status options fetched from the GitHub Projects v2 API. */
  options: ProjectStatusOption[];
  /** Currently selected option id. */
  selectedId: string;
  /** Called when the user selects an option. */
  onSelect: (id: string) => void;
  /** Whether options are currently being loaded. */
  loading?: boolean;
}

/** Map GitHub Projects v2 color names to CSS color values. */
const COLOR_MAP: Record<string, string> = {
  RED: '#e11d48',
  ORANGE: '#f97316',
  YELLOW: '#eab308',
  GREEN: '#22c55e',
  BLUE: '#3b82f6',
  PURPLE: '#a855f7',
  PINK: '#ec4899',
  GRAY: '#6b7280',
  GREY: '#6b7280',
};

function resolveColor(color: string): string {
  if (!color) {
    return theme.colors.border.medium;
  }
  const upper = color.toUpperCase();
  return COLOR_MAP[upper] ?? theme.colors.border.medium;
}

/**
 * Radio-button list that renders dynamic GitHub Projects v2 status options.
 * Replaces the hardcoded Open/Closed StatusSelector when a projectName is set.
 */
export const ProjectStatusSelector: React.FC<ProjectStatusSelectorProps> = ({
  options,
  selectedId,
  onSelect,
  loading = false,
}) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div style={{ marginBottom: theme.spacing.lg }}>
        <label
          style={{
            display: 'block',
            marginBottom: theme.spacing.sm,
            color: theme.colors.text.primary,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {t('quickActions.github.status')}
        </label>
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('quickActions.github.loadingStatuses', { defaultValue: 'Loading statuses…' })}
        </p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div style={{ marginBottom: theme.spacing.lg }}>
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('quickActions.github.noStatusOptions', { defaultValue: 'No status options found for this project.' })}
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label
        style={{
          display: 'block',
          marginBottom: theme.spacing.sm,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('quickActions.github.status')}
      </label>
      <div
        role="radiogroup"
        aria-label={t('quickActions.github.status')}
        style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}
      >
        {options.map(option => {
          const isSelected = option.id === selectedId;
          return (
            <label
              key={option.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.light}`,
                backgroundColor: isSelected ? theme.colors.primary.subtle : theme.colors.background.paper,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <input
                type="radio"
                name="project-status"
                value={option.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
                style={{ margin: 0, accentColor: theme.colors.primary.main }}
              />
              {/* Color dot — decorative only */}
              <span
                aria-hidden="true"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: resolveColor(option.color),
                  flexShrink: 0,
                }}
              />
              <span>{option.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};
