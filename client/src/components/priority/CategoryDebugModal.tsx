import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FiRefreshCw } from 'react-icons/fi';
import axios from 'axios';
import { theme } from 'theme/theme';

import { AccordionGroup } from 'components/inbox/debug/AccordionGroup';
import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { API_URL } from 'config/api';
import { OPACITY_DISABLED_ALT, OPACITY_FULL } from 'constants/numbers';

import { CategoryDebugData, CategoryDebugModalProps } from './CategoryDebugModal.types';
import { CategoriesList, CategorySection, EmailSection, UserContextSection } from './CategoryDebugPanels';
import { CategoryDebugTracePanel } from './CategoryDebugTracePanel';
import { formatForGithubIssue } from './categoryDebugUtils';

const COPY_FEEDBACK_DURATION_MS = 2000;

export type { CategoryDebugModalProps } from './CategoryDebugModal.types';

export const CategoryDebugModal: React.FC<CategoryDebugModalProps> = ({ emailId, onClose }) => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<CategoryDebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [traceLoading, setTraceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  const load = useCallback(
    async (deep: boolean) => {
      if (deep) {
        setTraceLoading(true);
        setTraceError(null);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const response = await axios.get<CategoryDebugData>(`${API_URL}/emails/${emailId}/debug/category`, {
          params: deep ? { deep: 1 } : {},
        });
        setDebugInfo(response.data);
      } catch {
        if (deep) {
          setTraceError(t('priority.categoryDebug.traceFetchError'));
        } else {
          setError(t('priority.categoryDebug.fetchError'));
        }
      } finally {
        if (deep) {
          setTraceLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [emailId, t]
  );

  useEffect(() => {
    void (async () => {
      await load(false);
      void load(true);
    })();
  }, [load]);

  const handleCopy = async () => {
    if (!debugInfo) {
      return;
    }
    const text = formatForGithubIssue(debugInfo);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      setError(t('priority.categoryDebug.copyFailed'));
    }
  };

  const handleRefreshTrace = () => {
    void load(true);
  };

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10001}>
      <ModalContent>
        <ModalHeaderWithClose title={t('priority.categoryDebug.title')} onClose={onClose} />

        {loading && (
          <div style={{ textAlign: 'center', padding: theme.spacing.md, color: theme.colors.text.secondary }}>
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div style={{ color: theme.colors.feedback?.error || '#d32f2f', padding: theme.spacing.sm }}>{error}</div>
        )}

        {debugInfo && !loading && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleRefreshTrace}
                disabled={traceLoading}
                title={t('priority.categoryDebug.refreshTraceTitle')}
                aria-label={t('priority.categoryDebug.refreshTraceTitle')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: theme.colors.background.subtle,
                  border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: traceLoading ? 'wait' : 'pointer',
                  padding: `4px ${theme.spacing.sm}`,
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.secondary,
                  opacity: traceLoading ? OPACITY_DISABLED_ALT : OPACITY_FULL,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    animation: traceLoading ? 'cat-debug-spin 0.8s linear infinite' : undefined,
                  }}
                >
                  <FiRefreshCw size={14} />
                </span>
                {t('priority.categoryDebug.refreshTrace')}
              </button>
              <style>{`@keyframes cat-debug-spin { to { transform: rotate(360deg); } }`}</style>
              <button
                type="button"
                onClick={() => void handleCopy()}
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
              {traceError && (
                <div
                  style={{
                    color: theme.colors.feedback?.error || '#d32f2f',
                    padding: theme.spacing.sm,
                    fontSize: theme.typography.fontSize.sm,
                  }}
                >
                  {traceError}
                </div>
              )}
              {traceLoading && (
                <div
                  style={{
                    padding: theme.spacing.md,
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.sm,
                  }}
                >
                  {t('priority.categoryDebug.traceLoading')}
                </div>
              )}
              {debugInfo.categorizationTrace && !traceLoading && (
                <CategoryDebugTracePanel trace={debugInfo.categorizationTrace} />
              )}
              <AccordionGroup
                title={t('priority.categoryDebug.referenceAllCategories')}
                count={debugInfo.emailCategories.length}
                defaultOpen={false}
              >
                <CategoriesList
                  includeHeading={false}
                  categories={debugInfo.emailCategories}
                  headerLabel=""
                  emptyLabel={t('priority.categoryDebug.noCategories')}
                />
              </AccordionGroup>
              {debugInfo.protoCategories.length > 0 ? (
                <AccordionGroup
                  title={t('priority.categoryDebug.referenceProtoCategories')}
                  count={debugInfo.protoCategories.length}
                  defaultOpen={false}
                >
                  <CategoriesList
                    includeHeading={false}
                    categories={debugInfo.protoCategories}
                    headerLabel=""
                    emptyLabel=""
                  />
                </AccordionGroup>
              ) : null}
              <AccordionGroup
                title={t('priority.categoryDebug.referenceUserContext')}
                count={
                  debugInfo.userContext.urgentItems.length +
                  debugInfo.userContext.notUrgentItems.length +
                  debugInfo.userContext.goals.length +
                  debugInfo.userContext.workingOn.length +
                  debugInfo.userContext.dontCare.length
                }
                defaultOpen={false}
              >
                <UserContextSection userContext={debugInfo.userContext} includeHeading={false} />
              </AccordionGroup>
            </div>
          </>
        )}
      </ModalContent>
    </ModalBackdrop>,
    document.body
  );
};
