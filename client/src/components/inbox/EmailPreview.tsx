import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { decodeHtmlEntities, stripHtmlTags } from 'utils/emailBodyUtils';

import { MAX_PREVIEW_LENGTH, TOOLTIP_PREVIEW_MAX_CHARS } from 'constants/numbers';
import { CATEGORY_OTHER } from 'constants/strings';

interface EmailPreviewProps {
  email: Email;
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({ email }) => {
  const { t } = useTranslation();
  // NULL categoryId means "Other" — source of truth after denorm removal (fixes #1293).
  const isOtherCategory = !email.category_id || email.category === CATEGORY_OTHER;
  const hasCategoryExplanation = isOtherCategory && email.categoryExplanation;
  // Detect when the explanation reveals a category mismatch (LLM suggested X but it didn't match).
  const isMatchFailExplanation =
    hasCategoryExplanation && email.categoryExplanation?.includes('not found in your category list');

  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
      <div
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.lg,
          maxWidth: '100%',
          minWidth: 0,
          lineHeight: theme.typography.lineHeight.relaxed,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {(() => {
          if (email.isProcessingSummary) {
            return (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    flexShrink: 0,
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${theme.colors.text.tertiary}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  ✨ {t('email.generatingSummary')}
                </span>
              </>
            );
          }
          if (email.summary) {
            return (
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {decodeHtmlEntities(email.summary)}
              </span>
            );
          }
          if (email.body) {
            const plainText = stripHtmlTags(email.body)
              .replace(/[\r\n]+/g, ' ')
              .trim();
            if (plainText) {
              return (
                <span
                  title={plainText.substring(0, TOOLTIP_PREVIEW_MAX_CHARS)}
                  style={{
                    cursor: 'help',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  {(() => {
                    const firstSentenceMatch = plainText.match(/^[^.!?]+[.!?]/);
                    if (firstSentenceMatch) {
                      return firstSentenceMatch[0].trim();
                    }
                    return `${plainText.substring(0, MAX_PREVIEW_LENGTH)}...`;
                  })()}
                </span>
              );
            }
          }
          return (
            <span style={{ color: theme.colors.text.tertiary, fontStyle: 'italic' }}>
              {t('inbox.noPreview', { defaultValue: 'Click to view email' })}
            </span>
          );
        })()}
      </div>
      {hasCategoryExplanation && (
        <div
          style={{
            color: isMatchFailExplanation ? theme.colors.text.secondary : theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.sm,
            marginTop: theme.spacing.xs,
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
          title={
            isMatchFailExplanation
              ? t('email.categoryMatchFailed', {
                  defaultValue: 'The AI suggested a category that does not exist in your settings',
                })
              : undefined
          }
        >
          <span>{isMatchFailExplanation ? '⚠️' : '💡'}</span>
          <span>{email.categoryExplanation}</span>
        </div>
      )}
    </div>
  );
};
