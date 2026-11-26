import React from 'react';
import { theme } from 'theme/theme';

import { EMOJI_WARNING } from 'constants/emojis';

interface BlockSenderWarningProps {
  title: string;
  detail: string;
}

/**
 * Calls out that an action also blocks the sender. Blocking auto-archives
 * everything that address sends later, which silently hides receipts and
 * invoices when a vendor sends marketing and billing from the same address,
 * so it must not read as a footnote to "archive".
 */
export const BlockSenderWarning: React.FC<BlockSenderWarningProps> = ({ title, detail }) => (
  <div
    role="note"
    style={{
      display: 'flex',
      gap: theme.spacing.sm,
      margin: `${theme.spacing.md} 0`,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.warning.light,
      borderLeft: `4px solid ${theme.colors.warning.main}`,
      borderRadius: theme.borderRadius.md,
      color: theme.colors.text.primary,
      fontSize: theme.typography.fontSize.sm,
      lineHeight: theme.typography.lineHeight.relaxed,
    }}
  >
    <span aria-hidden="true">{EMOJI_WARNING}</span>
    <div>
      <strong style={{ display: 'block', overflowWrap: 'anywhere' }}>{title}</strong>
      {detail}
    </div>
  </div>
);
