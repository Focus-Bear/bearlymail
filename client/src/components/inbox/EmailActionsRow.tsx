import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';
import { captureEvent } from 'utils/posthog';
import { extractUnsubscribeLink } from 'utils/unsubscribeUtils';

import { PrioritySlider } from 'components/inbox/actions/PrioritySlider';
import { SnoozeButton } from 'components/inbox/actions/SnoozeButton';
import { SnoozeInputForm } from 'components/inbox/actions/SnoozeInputForm';
import { OPACITY_DISABLED,TOAST_DURATION_MS } from 'components/inbox/constants';
import { EMOJI_BLOCK, EMOJI_INBOX, EMOJI_LINK } from 'constants/emojis';
import { MODE_TRIAGE } from 'constants/strings';

const EVENT_TYPE_CLICK = 'click';

const SUGGESTED_EMOJI_MAP: Record<number, string> = { 1: '😌', 2: '😅', 3: '🙀' };
const getSuggestedEmoji = (count: number): string => SUGGESTED_EMOJI_MAP[count] || '';

interface UnsubscribeOrBlockProps { email: Email; t: (k: string) => string; onBlockSender: (emailId: string, e: React.MouseEvent) => void; }
const UnsubscribeOrBlock: React.FC<UnsubscribeOrBlockProps> = ({ email, t, onBlockSender }) => {
  const unsubscribeLink = extractUnsubscribeLink((email as any).htmlBody, email.body);
  const btnStyle = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px', opacity: OPACITY_DISABLED, display: 'flex', alignItems: 'center', gap: theme.spacing.xs };
  if (unsubscribeLink) {
    return <button onClick={(e) => { e.stopPropagation(); window.open(unsubscribeLink, '_blank', 'noopener,noreferrer'); captureEvent('email_unsubscribe_clicked', { email_id: email.id }); }} title={t('inbox.unsubscribe')} style={btnStyle}><span>{EMOJI_LINK}</span><span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{t('inbox.unsubscribe')}</span></button>;
  }
  return <button onClick={(e) => onBlockSender(email.id, e)} title={t('inbox.blockSender')} style={btnStyle}><span>{EMOJI_BLOCK}</span><span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{t('inbox.blockSender')}</span></button>;
};

const HOVER_OPACITY = '1';
const DEFAULT_OPACITY = '0.7';

interface SuggestionSectionProps {
  suggestion: TriageSuggestion; email: Email;
  onSetStarCount: (emailId: string, starCount: number) => Promise<void>;
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  t: (k: string, opts?: Record<string, unknown>) => string;
}

const SuggestionSection: React.FC<SuggestionSectionProps> = ({ suggestion, email, onSetStarCount, onArchive, t }) => {
  const labelMap: Record<number, string> = { 1: t('inbox.canWait'), 2: t('inbox.getOnIt'), 3: t('inbox.ohShit') };
  const getSuggestedLabel = (count: number) => labelMap[count] || '';
  const hoverStyle = { opacity: HOVER_OPACITY };
  const defaultStyle = { opacity: DEFAULT_OPACITY };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
      {suggestion.suggestedStarCount > 0 ? (
        <div onClick={async (e) => { e.stopPropagation(); captureEvent('triage_suggestion_accepted', { email_id: email.id, suggested_star_count: suggestion.suggestedStarCount }); await onSetStarCount(email.id, suggestion.suggestedStarCount); }}
          style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, cursor: 'pointer', opacity: 0.7, transition: 'opacity 0.2s', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, defaultStyle)}
          title={t('inbox.clickToSetPriority', { priority: getSuggestedLabel(suggestion.suggestedStarCount) })}>
          <span style={{ fontSize: '1.2rem' }}>{getSuggestedEmoji(suggestion.suggestedStarCount)}</span>
          <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{t('inbox.suggested')}: {getSuggestedLabel(suggestion.suggestedStarCount)}</span>
        </div>
      ) : (
        <div onClick={async (e) => { e.stopPropagation(); captureEvent('triage_suggestion_archive_accepted', { email_id: email.id }); await onArchive(email.id, e); }}
          style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, cursor: 'pointer', opacity: 0.7, transition: 'opacity 0.2s', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}
          onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyle)}
          onMouseLeave={(e) => Object.assign(e.currentTarget.style, defaultStyle)}
          title={t('inbox.clickToArchive')}>
          <span>{EMOJI_INBOX}</span>
          <span style={{ fontWeight: theme.typography.fontWeight.medium }}>{t('inbox.suggested')}: {t('inbox.archive')}</span>
        </div>
      )}
    </div>
  );
};

interface EmailActionsRowProps {
  email: Email;
  mode: InboxMode;
  suggestion?: TriageSuggestion | null;
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  snoozeInput: {
    showSnoozeInput: string | null;
    getSnoozeValue: (emailId: string) => string;
    setSnoozeValue: (emailId: string, value: string) => void;
    showSnooze: (emailId: string) => void;
    clearSnooze: (emailId: string) => void;
  };
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, e: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
}

export const EmailActionsRow: React.FC<EmailActionsRowProps> = ({
  email,
  mode,
  suggestion,
  keyboardHint,
  snoozeInput,
  onSetStarCount,
  onArchive,
  onBlockSender,
  onSnooze,
}) => {
  const { t } = useTranslation();
  const isSnoozeInputVisible = snoozeInput.showSnoozeInput === email.id;
  const snoozeValue = snoozeInput.getSnoozeValue(email.id);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      {/* Actions Card */}
      <div style={{ backgroundColor: theme.colors.background.paper, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}`, padding: theme.spacing.md, display: 'flex', flexDirection: 'column', gap: theme.spacing.sm, marginBottom: theme.spacing.xs, }}>
        {/* Main actions row */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center', flexWrap: 'wrap', }}>
          {/* Prioritise section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', }}>
            <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, fontWeight: theme.typography.fontWeight.medium, whiteSpace: 'nowrap', }}>
              {t('inbox.prioritise')}:
            </div>
            <PrioritySlider
              email={email}
              keyboardHint={keyboardHint}
              onSetStarCount={onSetStarCount}
            />
          </div>

          {/* Suggested section */}
          {suggestion && mode === MODE_TRIAGE && (
            <SuggestionSection suggestion={suggestion} email={email} onSetStarCount={onSetStarCount} onArchive={onArchive} t={t} />
          )}

          {/* Other actions section */}
          <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto', }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive(email.id, e);
                if (e.type === EVENT_TYPE_CLICK && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
                  keyboardHint.showHint(email.id, t('inbox.pressDeleteToArchive'));
                  setTimeout(() => keyboardHint.hideHint(), TOAST_DURATION_MS);
                }
              }}
              title={t('inbox.archiveOrPressDelete')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px', display: 'flex', alignItems: 'center', gap: theme.spacing.xs, }}
            >
              <span>{EMOJI_INBOX}</span>
              <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{t('inbox.archive')}</span>
            </button>

            {mode !== MODE_TRIAGE && !isSnoozeInputVisible && (
              <SnoozeButton
                email={email}
                onShowSnooze={snoozeInput.showSnooze}
              />
            )}

            <UnsubscribeOrBlock email={email} t={t} onBlockSender={onBlockSender} />
          </div>
        </div>

        {/* Snooze input row - shown below main actions when snooze is active */}
        {mode !== MODE_TRIAGE && isSnoozeInputVisible && (
          <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.sm, }}>
            <SnoozeInputForm
              email={email}
              snoozeValue={snoozeValue}
              onValueChange={(value) => snoozeInput.setSnoozeValue(email.id, value)}
              onConfirm={() => onSnooze(email.id)}
              onCancel={() => snoozeInput.clearSnooze(email.id)}
            />
          </div>
        )}
      </div>
    </div>
  );
};

