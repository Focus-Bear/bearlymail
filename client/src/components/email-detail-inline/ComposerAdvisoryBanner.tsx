import React from 'react';
import { theme } from 'theme/theme';

interface ComposerAdvisoryBannerProps {
  /** Advisory text. Null/undefined = do not render. */
  message: string | null | undefined;
  emoji: string;
  emojiLabel: string;
  /** Optional bold prefix, e.g. "Calendar check:". */
  label?: string;
}

/**
 * Shared chrome for the composer's non-blocking pre-send advisories (missing
 * attachment, calendar mismatch, wrong recipient). Rendered separately from the
 * tone-check result so an advisory stays visible whether or not the tone check
 * itself passed, and never blocks the send.
 */
export const ComposerAdvisoryBanner: React.FC<ComposerAdvisoryBannerProps> = ({
  message,
  emoji,
  emojiLabel,
  label,
}) => {
  if (!message) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.sunray.light4,
        border: `1px solid ${theme.colors.accent.warning ?? theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.sm,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.primary,
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
      }}
    >
      <span role="img" aria-label={emojiLabel}>
        {emoji}
      </span>
      <span>
        {label ? <strong>{label}</strong> : null} {message}
      </span>
    </div>
  );
};
