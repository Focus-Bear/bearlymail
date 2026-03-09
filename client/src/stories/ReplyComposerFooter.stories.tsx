/**
 * Storybook stories for ReplyComposerFooter — v2
 *
 * Issues #729 / #731 — Fix labels, tooltips, schedule icon position,
 * Gmail-style schedule popup, keepInAction on own line.
 *
 * Changes covered:
 *  - Schedule button is now to the RIGHT of the Send button, ALWAYS visible
 *  - "I still need to take action" checkbox is ABOVE the Cancel/Send/Schedule row
 *  - Both rows are right-aligned for clean visual layout
 *  - Clicking schedule icon opens a Gmail-style popover with smart time suggestions
 *  - New story: SchedulePopupOpen
 *  - All previous stories preserved
 */
import React, { useState } from 'react';
import { FiCalendar, FiInfo } from 'react-icons/fi';
import type { Meta, StoryObj } from '@storybook/react';

// ---------------------------------------------------------------------------
// Inline theme + constants (mirrors the real theme so stories are self-contained)
// ---------------------------------------------------------------------------
const PRIMARY = '#E9902C';
const COLOR_WHITE_STORY = '#ffffff';
const COLOR_SUCCESS = '#059669';

const theme = {
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px' },
  colors: {
    primary: { main: PRIMARY },
    text: { primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF' },
    border: { light: '#E5E7EB', medium: '#D1D5DB' },
    background: { subtle: '#F9FAFB' },
  },
  borderRadius: { sm: '4px', md: '8px' },
  typography: {
    fontSize: { xs: '11px', sm: '13px', md: '15px' },
    fontWeight: { medium: 500 },
  },
};

// ---------------------------------------------------------------------------
// Minimal InfoTooltip (matches component implementation)
// ---------------------------------------------------------------------------
const InfoTooltip = ({ text }: { text: string }) => {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <FiInfo size={13} style={{ color: theme.colors.text.tertiary, cursor: 'help' }} />
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: theme.colors.text.primary,
            color: COLOR_WHITE_STORY,
            padding: '6px 10px',
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
            whiteSpace: 'normal',
            width: '220px',
            zIndex: 999,
            lineHeight: 1.4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Expected reply options
// ---------------------------------------------------------------------------
const EXPECTED_REPLY_OPTIONS = [
  { value: 0, label: 'No follow-up' },
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
  { value: 72, label: '3d' },
  { value: 168, label: '7d' },
];

const KEEP_IN_ACTION_TOOLTIP =
  'Helpful if you are just letting the other person know you got their message and still need to take action yourself.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getSelectedLabel = (expectedReplyHours: number): string =>
  EXPECTED_REPLY_OPTIONS.find((opt) => opt.value === expectedReplyHours)?.label ?? '';

const buildExpectedReplyTooltip = (expectedReplyHours: number): string => {
  if (expectedReplyHours === 0) {
return 'No follow-up reminder will be set for this email.';
}
  return `If the other person doesn't reply within ${getSelectedLabel(expectedReplyHours)}, I'll pop the email up in the follow up inbox`;
};

const getSendButtonText = (checkingTone: boolean, sending: boolean): string => {
  if (checkingTone) {
return 'Checking tone…';
}
  if (sending) {
return 'Sending…';
}
  return 'Send';
};

const formatSuggestionDate = (date: Date): string =>
  date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Schedule suggestions (mirrors component logic, using a fixed "now" for stories)
// ---------------------------------------------------------------------------
interface ScheduleSuggestion {
  label: string;
  sublabel: string;
  date: Date;
}

const getScheduleSuggestions = (now: Date = new Date()): ScheduleSuggestion[] => {
  const hour = now.getHours();
  const dow = now.getDay();
  const isWeekend = dow === 6 || dow === 0;
  const isLateEvening = hour >= 18;
  const isMorning = hour < 12;

  const daysUntilMonday = dow === 1 ? 7 : (1 - dow + 7) % 7;
  const mondayMorning = new Date(now);
  mondayMorning.setDate(now.getDate() + daysUntilMonday);
  mondayMorning.setHours(8, 0, 0, 0);

  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(now.getDate() + 1);
  if (tomorrowMorning.getDay() === 6) {
tomorrowMorning.setDate(tomorrowMorning.getDate() + 2);
} else if (tomorrowMorning.getDay() === 0) {
tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
}
  tomorrowMorning.setHours(8, 0, 0, 0);

  const thisAfternoon = new Date(now);
  thisAfternoon.setHours(13, 0, 0, 0);

  if (isWeekend) {
    return [{ label: 'Monday morning', sublabel: formatSuggestionDate(mondayMorning), date: mondayMorning }];
  }
  if (isLateEvening) {
    return [{ label: 'Tomorrow morning', sublabel: formatSuggestionDate(tomorrowMorning), date: tomorrowMorning }];
  }
  if (isMorning) {
    return [
      { label: 'This afternoon', sublabel: formatSuggestionDate(thisAfternoon), date: thisAfternoon },
      { label: 'Tomorrow morning', sublabel: formatSuggestionDate(tomorrowMorning), date: tomorrowMorning },
    ];
  }
  return [{ label: 'Tomorrow morning', sublabel: formatSuggestionDate(tomorrowMorning), date: tomorrowMorning }];
};

// ---------------------------------------------------------------------------
// SchedulePopup (standalone, for stories)
// ---------------------------------------------------------------------------
interface SchedulePopupProps {
  onSelectSuggestion: (date: Date) => void;
  onPickCustom: () => void;
  onClose: () => void;
}

const SchedulePopup: React.FC<SchedulePopupProps> = ({ onSelectSuggestion, onPickCustom, onClose }) => {
  const suggestions = getScheduleSuggestions();

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    padding: '10px 16px',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    width: '100%',
    textAlign: 'left',
    borderBottom: `1px solid ${theme.colors.border.light}`,
    gap: '2px',
  };

  return (
    <div
      data-testid="schedule-popup"
      role="dialog"
      aria-label="Schedule send"
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        backgroundColor: COLOR_WHITE_STORY,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        minWidth: '240px',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px 8px',
          fontWeight: theme.typography.fontWeight.medium,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          borderBottom: `1px solid ${theme.colors.border.light}`,
        }}
      >
        Schedule send
      </div>

      {suggestions.map((suggestion) => (
        <button
          key={suggestion.label}
          style={itemStyle}
          onClick={() => onSelectSuggestion(suggestion.date)}
          onMouseEnter={(event) => {
 (event.currentTarget as HTMLButtonElement).style.backgroundColor = theme.colors.background.subtle; 
}}
          onMouseLeave={(event) => {
 (event.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; 
}}
        >
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>{suggestion.label}</span>
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>{suggestion.sublabel}</span>
        </button>
      ))}

      <button
        style={{ ...itemStyle, borderBottom: 'none', color: PRIMARY }}
        onClick={onPickCustom}
        onMouseEnter={(event) => {
 (event.currentTarget as HTMLButtonElement).style.backgroundColor = theme.colors.background.subtle; 
}}
        onMouseLeave={(event) => {
 (event.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; 
}}
      >
        <span style={{ fontSize: theme.typography.fontSize.sm }}>Pick date &amp; time...</span>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Story component
// ---------------------------------------------------------------------------
interface FooterDemoProps {
  sending?: boolean;
  checkingTone?: boolean;
  draft?: string | null;
  showSchedule?: boolean;
  scheduledSendAt?: Date | null;
  keepInActionChecked?: boolean;
  schedulePopupOpen?: boolean;
}

// eslint-disable-next-line max-lines-per-function -- standalone story component mirrors ReplyComposerFooter; complexity is inherent
const FooterDemo: React.FC<FooterDemoProps> = ({
  sending = false,
  checkingTone = false,
  draft = 'Test reply content',
  showSchedule = false,
  scheduledSendAt = null,
  keepInActionChecked = false,
  schedulePopupOpen = false,
}) => {
  const [expectedReplyHours, setExpectedReplyHours] = useState(48);
  const [keepInAction, setKeepInAction] = useState(keepInActionChecked);
  const [sent, setSent] = useState(false);
  const [scheduled, setScheduled] = useState<Date | null>(null);
  const [showPopup, setShowPopup] = useState(schedulePopupOpen);

  const isDisabled = !draft || sending || checkingTone;
  const interactiveCursor = (sending || checkingTone) ? 'not-allowed' : 'pointer';

  if (sent) {
    return (
      <div style={{ padding: theme.spacing.md, color: COLOR_SUCCESS, fontWeight: theme.typography.fontWeight.medium }}>
        ✅ Reply sent! (expectedReplyHours={expectedReplyHours}, keepInAction={String(keepInAction)})
      </div>
    );
  }

  if (scheduled) {
    return (
      <div style={{ padding: theme.spacing.md, color: COLOR_SUCCESS, fontWeight: theme.typography.fontWeight.medium }}>
        🗓 Scheduled for {scheduled.toLocaleString()} (expectedReplyHours={expectedReplyHours}, keepInAction={String(keepInAction)})
      </div>
    );
  }

  return (
    <div style={{ padding: theme.spacing.md, maxWidth: 600, fontFamily: 'system-ui, sans-serif' }}>
      {scheduledSendAt && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', color: PRIMARY, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md }}>
          <span>🕐</span>
          <span>Sending {scheduledSendAt.toLocaleString()}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.text.tertiary, fontSize: '14px', padding: '0 2px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Row 1: Expected reply */}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap', marginBottom: theme.spacing.md }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, whiteSpace: 'nowrap' }}>
          Expect a reply within
          <InfoTooltip text={buildExpectedReplyTooltip(expectedReplyHours)} />
        </span>
        <select
          value={expectedReplyHours}
          onChange={(event) => setExpectedReplyHours(Number(event.target.value))}
          disabled={sending || checkingTone}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: theme.colors.background.subtle,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.xs,
            cursor: interactiveCursor,
          }}
        >
          {EXPECTED_REPLY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Row 2: "I still need to take action" — above the button row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginBottom: theme.spacing.md }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={keepInAction}
            onChange={(event) => setKeepInAction(event.target.checked)}
            disabled={sending || checkingTone}
            style={{ cursor: interactiveCursor }}
          />
          I still need to take action
          <InfoTooltip text={KEEP_IN_ACTION_TOOLTIP} />
        </label>
      </div>

      {/* Row 3: Cancel / Send / Schedule (schedule always visible on the RIGHT) */}
      <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-start', alignItems: 'center' }}>
        <button
          disabled={sending || checkingTone}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: 'transparent',
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: interactiveCursor,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          Cancel
        </button>

        <button
          disabled={isDisabled}
          onClick={() => setSent(true)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: isDisabled ? theme.colors.background.subtle : PRIMARY,
            color: isDisabled ? theme.colors.text.tertiary : COLOR_WHITE_STORY,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {getSendButtonText(checkingTone, sending)}
        </button>

        {/* Schedule icon — RIGHT of Send, always rendered */}
        <div style={{ position: 'relative' }}>
          <button
            disabled={isDisabled}
            title="Schedule send"
            aria-label="Schedule send"
            aria-expanded={showPopup}
            aria-haspopup="dialog"
            onClick={() => {
 if (!isDisabled) {
setShowPopup((prev) => !prev);
} 
}}
            style={{
              padding: theme.spacing.sm,
              backgroundColor: 'transparent',
              color: isDisabled ? theme.colors.text.tertiary : PRIMARY,
              border: `1px solid ${isDisabled ? theme.colors.border.light : PRIMARY}`,
              borderRadius: theme.borderRadius.md,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.md,
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FiCalendar size={16} />
          </button>

          {showPopup && (
            <SchedulePopup
              onSelectSuggestion={(date) => {
 setShowPopup(false); setScheduled(date); 
}}
              onPickCustom={() => {
 setShowPopup(false); alert('Custom date picker would open here'); 
}}
              onClose={() => setShowPopup(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------
const meta: Meta<typeof FooterDemo> = {
  title: 'EmailDetail/ReplyComposerFooter',
  component: FooterDemo,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Footer of the reply composer. Layout (top to bottom, all right-aligned): (1) Expected-reply selector row, (2) "I still need to take action" checkbox row, (3) Cancel / Send / Schedule button row — schedule icon is always visible to the RIGHT of Send.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof FooterDemo>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Default state — draft ready to send */
export const Default: Story = {
  name: 'Default',
  args: { draft: 'Hello, just following up…' },
};

/** With schedule button visible (icon is to the RIGHT of Send) */
export const WithScheduleButton: Story = {
  name: 'With Schedule Button',
  args: { draft: 'Hello, just following up…', showSchedule: true },
};

/** Schedule popup open — showing Gmail-style smart suggestions */
export const SchedulePopupOpen: Story = {
  name: 'Schedule Popup Open',
  args: { draft: 'Hello, just following up…', showSchedule: true, schedulePopupOpen: true },
};

/** Pre-scheduled send time shown */
export const Scheduled: Story = {
  name: 'Scheduled Send',
  args: {
    draft: 'Hello, just following up…',
    showSchedule: true,
    scheduledSendAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  },
};

/** Keep-in-action pre-checked */
export const KeepInActionChecked: Story = {
  name: 'Keep In Action Checked',
  args: { draft: 'Hello, just following up…', keepInActionChecked: true },
};

/** Disabled — no draft */
export const NoDraft: Story = {
  name: 'Disabled (No Draft)',
  args: { draft: null, showSchedule: true },
};

/** Sending in progress */
export const SendingInProgress: Story = {
  name: 'Sending In Progress',
  args: { draft: 'Hello…', sending: true },
};

/** Tone check in progress */
export const CheckingTone: Story = {
  name: 'Checking Tone',
  args: { draft: 'Hello…', checkingTone: true },
};
