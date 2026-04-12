import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { FeedbackItem } from 'types/feedback';

import { OPACITY_HALF } from 'constants/numbers';

const cardStyle: React.CSSProperties = {
  padding: theme.spacing.md,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
};

interface Props {
  item: FeedbackItem;
  deletingId: string | null;
  onDelete: (id: string) => void | Promise<void>;
  t: ReturnType<typeof useTranslation>['t'];
}

export const FeedbackCard: React.FC<Props> = ({ item, deletingId, onDelete, t }) => {
  return (
    <div style={cardStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        <div>
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
            {new Date(item.createdAt).toLocaleString()}
          </span>
          {item.userEmail && (
            <span
              style={{
                marginLeft: theme.spacing.sm,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}
            >
              · {item.userEmail}
            </span>
          )}
          {item.appVersion && (
            <span
              style={{
                marginLeft: theme.spacing.sm,
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.secondary,
              }}
            >
              {t('contactFeedback.adminVersionPrefix')}
              {item.appVersion}
            </span>
          )}
        </div>
        <button
          onClick={() => onDelete(item.id)}
          disabled={deletingId === item.id}
          style={{
            background: 'none',
            border: `1px solid ${theme.colors.error.main}`,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.error.main,
            cursor: deletingId === item.id ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.xs,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            opacity: deletingId === item.id ? OPACITY_HALF : 1,
          }}
        >
          {t('contactFeedback.adminDelete')}
        </button>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {item.message}
      </p>

      {item.screenshotUrl && (
        <div>
          <a
            href={item.screenshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block' }}
            aria-label={t('contactFeedback.adminScreenshotAlt')}
          >
            <img
              src={item.screenshotUrl}
              alt={t('contactFeedback.adminScreenshotAlt')}
              style={{
                maxWidth: '100%',
                maxHeight: '200px',
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.light}`,
                display: 'block',
                cursor: 'pointer',
              }}
              onError={event => {
                // Hide broken image (e.g. expired presigned URL)
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </a>
        </div>
      )}

      {item.userAgent && (
        <p style={{ margin: 0, fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
          {item.userAgent}
        </p>
      )}
    </div>
  );
};
