import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_TEXTAREA_HEIGHT_PX } from 'components/inbox/constants';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

const MAX_PREVIEW_DISPLAY_COUNT = 10;

interface FollowUpPreviewListProps {
  selectedFollowUps: Array<{ id: string; draftFollowUp?: string | null }>;
  selectedThreads: ThreadWithFollowUp[];
  selectedCount: number;
}

export const FollowUpPreviewList: React.FC<FollowUpPreviewListProps> = ({
  selectedFollowUps,
  selectedThreads,
  selectedCount,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        maxHeight: '400px',
        overflow: 'auto',
      }}
    >
      {selectedFollowUps.slice(0, 10).map(fu => {
        const thread = selectedThreads.find(thread => thread.followUp?.id === fu.id);
        return (
          <div
            key={fu.id}
            style={{
              padding: theme.spacing.md,
              marginBottom: theme.spacing.sm,
              backgroundColor: theme.colors.background.default,
              borderRadius: theme.borderRadius.md,
            }}
          >
            <div
              style={{
                fontWeight: theme.typography.fontWeight.semibold,
                marginBottom: theme.spacing.xs,
              }}
            >
              {thread?.subject || t('inbox.followUp')}
            </div>
            <div
              style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                whiteSpace: 'pre-wrap',
              }}
            >
              {fu.draftFollowUp?.substring(0, MAX_TEXTAREA_HEIGHT_PX)}
              {fu.draftFollowUp && fu.draftFollowUp.length > MAX_TEXTAREA_HEIGHT_PX ? '...' : ''}
            </div>
          </div>
        );
      })}
      {selectedCount > MAX_PREVIEW_DISPLAY_COUNT && (
        <div
          style={{
            padding: theme.spacing.md,
            textAlign: 'center',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('inbox.andMore', { count: selectedCount - MAX_PREVIEW_DISPLAY_COUNT })}
        </div>
      )}
    </div>
  );
};
