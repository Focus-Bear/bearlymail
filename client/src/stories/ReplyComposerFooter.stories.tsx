/**
 * Storybook stories for ReplyComposerFooter — Fixes #717.
 *
 * The component uses useTranslation / theme / PostHog which require providers
 * not set up in Storybook. Stories are self-contained renders that faithfully
 * replicate the component's visual output and interactive behaviour without
 * external dependencies, following the pattern used in this project's other
 * story files (e.g. EmailDetailActions.stories.tsx, SummarySection.stories.tsx).
 */
import React, { useState } from 'react';
import type { StoryObj } from '@storybook/react';

// ─── Design tokens (mirrors theme/theme.ts) ──────────────────────────────────
const Th = {
  border: { light: '#E5E7EB', medium: '#D1D5DB' },
  text: { primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF' },
  bg: { subtle: '#F9FAFB' },
  primary: { main: '#E9902C' },
  sp: { xs: '4px', sm: '8px', md: '16px', lg: '24px' },
  r: { sm: '4px', md: '8px' },
  f: { xs: '11px', sm: '13px', md: '16px' },
  fw: { medium: 500 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatScheduledTime = (date: Date): string =>
  date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// ─── Localisation strings (mirrors en.json keys used by the component) ───────
const translate = (key: string, params?: Record<string, unknown>): string => {
  const strings: Record<string, string> = {
    'emailDetail.expectedReply.label': 'Expected reply',
    'emailDetail.expectedReply.none': 'None',
    'emailDetail.expectedReply.hours_one': '{{count}} hour',
    'emailDetail.expectedReply.hours_other': '{{count}} hours',
    'emailDetail.expectedReply.days_one': '{{count}} day',
    'emailDetail.expectedReply.days_other': '{{count}} days',
    'emailDetail.keepInAction': 'Keep in action items',
    'emailDetail.checkingTone': '⏳ Checking tone…',
    'emailDetail.sending': '⏳ Sending…',
    'emailDetail.send': 'Send',
    'emailDetail.schedule': 'Schedule',
    'common.cancel': 'Cancel',
    'compose.scheduledFor': 'Scheduled for {{time}}',
    'compose.clearSchedule': 'Clear scheduled send',
  };
  let result = strings[key] ?? key;
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(`{{${paramKey}}}`, String(paramValue));
    }
  }
  return result;
};

const EXPECTED_REPLY_OPTIONS = [
  { value: 0, label: translate('emailDetail.expectedReply.none') },
  { value: 24, label: '24 hours' },
  { value: 48, label: '48 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' },
];

// ─── Component ────────────────────────────────────────────────────────────────
interface FooterProps {
  sending?: boolean;
  checkingTone?: boolean;
  draft?: string | null;
  scheduledSendAt?: Date | null;
  showScheduleButton?: boolean;
}

const ReplyComposerFooterDemo: React.FC<FooterProps> = ({
  sending = false,
  checkingTone = false,
  draft = 'Hi there, just following up on our last conversation…',
  scheduledSendAt = null,
  showScheduleButton = true,
}) => {
  const [expectedReplyHours, setExpectedReplyHours] = useState<number>(48);
  const [keepInAction, setKeepInAction] = useState<boolean>(false);
  const [scheduled, setScheduled] = useState<Date | null>(scheduledSendAt);
  const [sendLog, setSendLog] = useState<string | null>(null);

  const isDisabled = !draft || sending || checkingTone;

  const getButtonText = (): string => {
    if (checkingTone) {
      return translate('emailDetail.checkingTone');
    }
    return sending ? translate('emailDetail.sending') : translate('emailDetail.send');
  };

  const handleSend = () => {
    setSendLog(
      JSON.stringify(
        { expectedReplyHours, scheduledSendAt: scheduled?.toISOString() ?? null, keepInAction },
        null,
        2,
      ),
    );
  };

  const handleSchedule = () => {
    const twodays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    setScheduled(twodays);
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div
        style={{
          background: '#fff',
          border: `1px solid ${Th.border.light}`,
          borderRadius: Th.r.md,
          padding: Th.sp.md,
        }}
      >
        {/* ── Mock draft textarea ──────────────────────────────────────── */}
        <div
          style={{
            border: `1px solid ${Th.border.light}`,
            borderRadius: Th.r.sm,
            padding: Th.sp.sm,
            minHeight: 80,
            fontSize: Th.f.sm,
            color: draft ? Th.text.primary : Th.text.tertiary,
            marginBottom: Th.sp.md,
            fontStyle: draft ? 'normal' : 'italic',
          }}
        >
          {draft ?? '(no draft — send + schedule buttons will be disabled)'}
        </div>

        {/* ── Scheduled send indicator ─────────────────────────────────── */}
        {scheduled && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              color: Th.primary.main,
              fontSize: Th.f.sm,
              marginBottom: Th.sp.md,
            }}
          >
            <span>🕐</span>
            <span>{translate('compose.scheduledFor', { time: formatScheduledTime(scheduled) })}</span>
            <button
              onClick={() => setScheduled(null)}
              title={translate('compose.clearSchedule')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: Th.text.tertiary,
                fontSize: '14px',
                padding: '0 2px',
                lineHeight: '1',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── Controls row ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: Th.sp.sm,
            flexWrap: 'wrap',
            marginBottom: Th.sp.md,
          }}
        >
          <span style={{ fontSize: Th.f.sm, color: Th.text.secondary, whiteSpace: 'nowrap' }}>
            {translate('emailDetail.expectedReply.label')}:
          </span>
          <select
            value={expectedReplyHours}
            onChange={selectEvent => setExpectedReplyHours(Number(selectEvent.target.value))}
            disabled={sending || checkingTone}
            style={{
              padding: `${Th.sp.xs} ${Th.sp.sm}`,
              border: `1px solid ${Th.border.light}`,
              borderRadius: Th.r.sm,
              backgroundColor: Th.bg.subtle,
              color: Th.text.secondary,
              fontSize: Th.f.xs,
              cursor: sending || checkingTone ? 'not-allowed' : 'pointer',
            }}
          >
            {EXPECTED_REPLY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: Th.sp.xs,
              fontSize: Th.f.sm,
              color: Th.text.secondary,
              cursor: sending || checkingTone ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={keepInAction}
              onChange={checkboxEvent => setKeepInAction(checkboxEvent.target.checked)}
              disabled={sending || checkingTone}
              style={{ cursor: sending || checkingTone ? 'not-allowed' : 'pointer' }}
            />
            {translate('emailDetail.keepInAction')}
          </label>
        </div>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <div
          style={{ display: 'flex', gap: Th.sp.sm, justifyContent: 'flex-end', alignItems: 'center' }}
        >
          <button
            disabled={sending || checkingTone}
            style={{
              padding: `${Th.sp.sm} ${Th.sp.lg}`,
              background: 'transparent',
              color: Th.text.secondary,
              border: `1px solid ${Th.border.medium}`,
              borderRadius: Th.r.md,
              cursor: sending || checkingTone ? 'not-allowed' : 'pointer',
              fontSize: Th.f.sm,
            }}
          >
            {translate('common.cancel')}
          </button>

          {showScheduleButton && (
            <button
              onClick={handleSchedule}
              disabled={isDisabled}
              title={translate('emailDetail.schedule')}
              aria-label={translate('emailDetail.schedule')}
              style={{
                padding: Th.sp.sm,
                background: 'transparent',
                color: isDisabled ? Th.text.tertiary : Th.primary.main,
                border: `1px solid ${isDisabled ? Th.border.light : Th.primary.main}`,
                borderRadius: Th.r.md,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: Th.f.md,
                lineHeight: '1',
              }}
            >
              📅
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={isDisabled}
            style={{
              padding: `${Th.sp.sm} ${Th.sp.lg}`,
              backgroundColor: isDisabled ? Th.bg.subtle : Th.primary.main,
              color: isDisabled ? Th.text.tertiary : '#fff',
              border: 'none',
              borderRadius: Th.r.md,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: Th.f.sm,
              fontWeight: Th.fw.medium,
            }}
          >
            {getButtonText()}
          </button>
        </div>
      </div>

      {/* ── Send log (interactive feedback) ──────────────────────────────── */}
      {sendLog && (
        <div
          style={{
            marginTop: Th.sp.md,
            padding: Th.sp.md,
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: Th.r.md,
          }}
        >
          <strong style={{ color: '#166534', fontSize: Th.f.sm }}>✅ onSend called with:</strong>
          <pre style={{ fontSize: Th.f.xs, color: '#166534', margin: `${Th.sp.xs} 0 0`, whiteSpace: 'pre-wrap' }}>
            {sendLog}
          </pre>
        </div>
      )}
    </div>
  );
};

// ─── Stories ──────────────────────────────────────────────────────────────────
type Story = StoryObj<typeof ReplyComposerFooterDemo>;

export default {
  title: 'Email/ReplyComposerFooter',
  component: ReplyComposerFooterDemo,
  parameters: {
    docs: {
      description: {
        component:
          'Footer bar of the inline reply composer. Handles expected-reply dropdown, keepInAction checkbox, optional schedule button (📅), scheduled-send indicator with clear (×), and the Send / Cancel actions. Click 📅 to see the scheduled-send indicator; click Send to log resolved props.',
      },
    },
  },
};

/**
 * Default state — draft present, all controls enabled.
 * Expected-reply defaults to 48 h; keepInAction unchecked.
 * Click 📅 to simulate picking a scheduled send time (2 days out).
 * Click Send to see the resolved prop values.
 */
export const Default: Story = {
  args: {
    sending: false,
    checkingTone: false,
    draft: 'Hi there, just following up on our last conversation about the Q3 report…',
    scheduledSendAt: null,
    showScheduleButton: true,
  },
};

/**
 * No draft — empty draft string disables Send and Schedule buttons.
 * Cancel remains enabled. Expected-reply and keepInAction controls
 * reflect their defaults but are functionally locked.
 */
export const NoDraft: Story = {
  args: {
    ...Default.args,
    draft: null,
  },
};

/**
 * Sending in progress — all controls disabled, button shows ⏳ Sending….
 * Matches the UI while the email is being delivered to the backend.
 */
export const Sending: Story = {
  args: {
    ...Default.args,
    sending: true,
  },
};

/**
 * Checking tone — all controls disabled while PostHog / AI tone analysis runs.
 * Button shows ⏳ Checking tone… to give clear feedback on what is happening.
 */
export const CheckingTone: Story = {
  args: {
    ...Default.args,
    checkingTone: true,
  },
};

/**
 * Scheduled send — 🕐 indicator shown with the scheduled time and a × clear button.
 * Clicking × removes the scheduled date. Clicking 📅 re-schedules to 2 days out.
 */
export const WithScheduledSend: Story = {
  args: {
    ...Default.args,
    scheduledSendAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
};

/**
 * No schedule button — footer without the 📅 schedule option.
 * Used when the parent composer does not provide an onSchedule handler.
 */
export const NoScheduleButton: Story = {
  args: {
    ...Default.args,
    showScheduleButton: false,
  },
};
