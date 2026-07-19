import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import { CategoryDebugDraftRulePanel } from './CategoryDebugDraftRulePanel';
import { CategoryDebugData, CategoryDebugModalProps } from './CategoryDebugModal.types';
import { CategoriesList, CategorySection, EmailSection, UserContextSection } from './CategoryDebugPanels';
import { CategoryDebugThreadTimeline } from './CategoryDebugThreadTimeline';
import { CategoryDebugTracePanel } from './CategoryDebugTracePanel';
import { formatForGithubIssue } from './categoryDebugUtils';
import { CategoryDecisionTracePanel } from './CategoryDecisionTracePanel';
import { LocalModelDecisionPanel } from './LocalModelDecisionPanel';

const MFA_VERIFICATION_REQUIRED = 'MFA_VERIFICATION_REQUIRED';
const MFA_SETUP_REQUIRED = 'MFA_SETUP_REQUIRED';
const MFA_TOKEN_LENGTH = 6;
const HTTP_FORBIDDEN = 403;
const ENTER_KEY = 'Enter';
const COLOR_WHITE = '#fff';

const MFA_STATES = {
  NONE: 'none',
  VERIFICATION_REQUIRED: 'verification-required',
  SETUP_REQUIRED: 'setup-required',
} as const;
type MfaState = typeof MFA_STATES[keyof typeof MFA_STATES];

const COPY_FEEDBACK_DURATION_MS = 2000;

export type { CategoryDebugModalProps } from './CategoryDebugModal.types';

export // eslint-disable-next-line complexity -- pre-existing: many conditional branches in render
const CategoryDebugModal: React.FC<CategoryDebugModalProps> = ({ emailId, onClose }) => {
  const { t } = useTranslation();
  const [debugInfo, setDebugInfo] = useState<CategoryDebugData | null>(null);
  const [loading, setLoading] = useState(true);
  const [traceLoading, setTraceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);
  const [mfaState, setMfaState] = useState<MfaState>(MFA_STATES.NONE);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showDraftRule, setShowDraftRule] = useState(false);
  const mfaInputRef = useRef<HTMLInputElement>(null);

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
        if (!deep) {
          setMfaState(MFA_STATES.NONE);
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === HTTP_FORBIDDEN) {
          const responseData = err.response.data as { error?: string } | undefined;
          if (responseData?.error === MFA_VERIFICATION_REQUIRED) {
            if (!deep) {
              setMfaState(MFA_STATES.VERIFICATION_REQUIRED);
            }
            return;
          }
          if (responseData?.error === MFA_SETUP_REQUIRED) {
            if (!deep) {
              setMfaState(MFA_STATES.SETUP_REQUIRED);
            }
            return;
          }
        }
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

  useEffect(() => {
    if (mfaState === MFA_STATES.VERIFICATION_REQUIRED) {
      mfaInputRef.current?.focus();
    }
  }, [mfaState]);

  const handleMfaVerify = useCallback(async () => {
    if (mfaToken.length !== MFA_TOKEN_LENGTH) {
      return;
    }
    setMfaLoading(true);
    setMfaError(null);
    try {
      await axios.post(`${API_URL}/auth/mfa/verify`, { token: mfaToken });
      setMfaToken('');
      setMfaState(MFA_STATES.NONE);
      await load(false);
      void load(true);
    } catch {
      setMfaError(t('priority.categoryDebug.mfaError'));
    } finally {
      setMfaLoading(false);
    }
  }, [mfaToken, load, t]);

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

        {loading && mfaState === MFA_STATES.NONE && (
          <div style={{ textAlign: 'center', padding: theme.spacing.md, color: theme.colors.text.secondary }}>
            {t('common.loading')}
          </div>
        )}

        {error && (
          <div style={{ color: theme.colors.feedback?.error || '#d32f2f', padding: theme.spacing.sm }}>{error}</div>
        )}

        {mfaState === MFA_STATES.SETUP_REQUIRED && (
          <div style={{ padding: theme.spacing.md, color: theme.colors.text.secondary }}>
            {t('priority.categoryDebug.mfaSetupRequired')}
          </div>
        )}

        {mfaState === MFA_STATES.VERIFICATION_REQUIRED && (
          <div style={{ padding: theme.spacing.md }}>
            <p style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.sm, fontWeight: theme.typography.fontWeight.medium }}>
              {t('priority.categoryDebug.mfaRequired')}
            </p>
            <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm }}>
              {t('priority.categoryDebug.mfaPrompt')}
            </p>
            <input
              ref={mfaInputRef}
              type="text"
              inputMode="numeric"
              maxLength={MFA_TOKEN_LENGTH}
              value={mfaToken}
              onChange={ev => setMfaToken(ev.target.value.replace(/\D/g, '').slice(0, MFA_TOKEN_LENGTH))}
              onKeyDown={ev => {
                if (ev.key === ENTER_KEY) {
                  void handleMfaVerify();
                }
              }}
              placeholder="000000"
              disabled={mfaLoading}
              aria-label={t('priority.categoryDebug.mfaTokenLabel')}
              style={{
                width: '160px',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${mfaError ? (theme.colors.feedback?.error || '#d32f2f') : (theme.colors.border?.default || '#e0e0e0')}`,
                fontSize: theme.typography.fontSize.xl,
                letterSpacing: '0.3em',
                textAlign: 'center',
                display: 'block',
                marginBottom: theme.spacing.sm,
              }}
            />
            {mfaError && (
              <p role="alert" style={{ color: theme.colors.feedback?.error || '#d32f2f', fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.sm }}>
                {mfaError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleMfaVerify()}
              disabled={mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH}
              style={{
                backgroundColor: mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH ? theme.colors.text.tertiary : theme.colors.primary?.main || '#1976d2',
                color: COLOR_WHITE,
                border: 'none',
                borderRadius: theme.borderRadius.md,
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                cursor: mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH ? 'not-allowed' : 'pointer',
                fontSize: theme.typography.fontSize.base,
              }}
            >
              {mfaLoading ? t('common.loading') : t('priority.categoryDebug.mfaVerify')}
            </button>
          </div>
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
              <button
                type="button"
                onClick={() => setShowDraftRule(prev => !prev)}
                aria-expanded={showDraftRule}
                style={{
                  background: showDraftRule
                    ? theme.colors.primary?.main || '#1976d2'
                    : theme.colors.background.subtle,
                  border: `1px solid ${theme.colors.border?.default || '#e0e0e0'}`,
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  padding: `4px ${theme.spacing.sm}`,
                  fontSize: theme.typography.fontSize.xs,
                  color: showDraftRule ? COLOR_WHITE : theme.colors.text.secondary,
                }}
              >
                {t('priority.categoryDebug.draftRule.button')}
              </button>
            </div>
            {showDraftRule && (
              <CategoryDebugDraftRulePanel
                emailId={emailId}
                categories={debugInfo.emailCategories}
                onClose={() => setShowDraftRule(false)}
              />
            )}
            <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
              <EmailSection email={debugInfo.email} />
              <CategoryDebugThreadTimeline
                threadEmails={debugInfo.threadEmails ?? []}
                analyzedEmail={debugInfo.thread.categoryDecisionTrace?.analyzedEmail}
              />
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
              <LocalModelDecisionPanel
                localModelDebug={debugInfo.thread.localModelDebug}
              />
              <CategoryDecisionTracePanel
                trace={debugInfo.thread.categoryDecisionTrace}
                emailCategories={debugInfo.emailCategories}
              />
              {debugInfo.categorizationTrace && !traceLoading && (
                <CategoryDebugTracePanel
                  trace={debugInfo.categorizationTrace}
                  storedShortlist={debugInfo.thread.shortlistedCategoryNames}
                  processingSnapshot={debugInfo.thread.categoryRuleTrace}
                  storedCategory={debugInfo.thread.category}
                  storedDecidedAt={debugInfo.thread.categoryDecisionTrace?.decidedAt ?? null}
                />
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
