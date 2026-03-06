import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { API_URL } from 'config/api';

import { CategoryDebugData, CategoryDebugModalProps } from './CategoryDebugModal.types';
import { CategoriesList, CategorySection, EmailSection, UserContextSection } from './CategoryDebugPanels';
import { formatForGithubIssue } from './categoryDebugUtils';

const COPY_FEEDBACK_DURATION_MS = 2000;

export type { CategoryDebugModalProps } from './CategoryDebugModal.types';

export const CategoryDebugModal: React.FC<CategoryDebugModalProps> = ({
  emailId,
  onClose,
}) => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<CategoryDebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchDebugData = async () => {
      try {
        const response = await axios.get(`${API_URL}/emails/${emailId}/debug/category`);
        setDebugInfo(response.data);
      } catch (err) {
        setError(t('priority.categoryDebug.fetchError'));
      } finally {
        setLoading(false);
      }
    };
    fetchDebugData();
  }, [emailId, t]);

  const handleCopy = async () => {
    if (!debugInfo) return;
    const text = formatForGithubIssue(debugInfo);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      setError(t('priority.categoryDebug.copyFailed'));
    }
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10001}>
      <ModalContent>
        <ModalHeaderWithClose
          title={t('priority.categoryDebug.title')}
          onClose={onClose}
        />

        {loading && (
          <div style={{ textAlign: 'center', padding: theme.spacing.md, color: theme.colors.text.secondary }}>
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div style={{ color: theme.colors.feedback?.error || '#d32f2f', padding: theme.spacing.sm }}>
            {error}
          </div>
        )}

        {debugInfo && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.xs }}>
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? theme.colors.feedback?.success || '#388e3c' : theme.colors.background.subtle,
                  border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  padding: `4px ${theme.spacing.sm}`,
                  fontSize: theme.typography.fontSize.xs,
                  color: copied ? '#fff' : theme.colors.text.secondary,
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {copied ? t('priority.categoryDebug.copied') : t('priority.categoryDebug.copyForIssue')}
              </button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
              <EmailSection email={debugInfo.email} />
              <CategorySection thread={debugInfo.thread} />
              <CategoriesList
                categories={debugInfo.emailCategories}
                headerLabel={`${t('priority.categoryDebug.availableCategories')} (${debugInfo.emailCategories.length})`}
                emptyLabel={t('priority.categoryDebug.noCategories')}
              />
              {debugInfo.protoCategories.length > 0 && (
                <CategoriesList
                  categories={debugInfo.protoCategories}
                  headerLabel={`${t('priority.categoryDebug.protoCategories')} (${debugInfo.protoCategories.length})`}
                  emptyLabel=""
                />
              )}
              <UserContextSection userContext={debugInfo.userContext} />
            </div>
          </>
        )}
      </ModalContent>
    </ModalBackdrop>,
    document.body,
  );
};
