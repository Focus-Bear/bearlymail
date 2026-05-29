import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';
import { STRING_UTC } from 'constants/strings';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

interface ScheduleStepProps {
  onComplete: () => void;
  onBack: () => void;
}

type Frequency = 2 | 3 | 4;

const FREQ_TWO: Frequency = 2;
const FREQ_THREE: Frequency = 3;
const FREQ_FOUR: Frequency = 4;
const NOON_HOUR = 12;
const HOUR_WRAP_OFFSET = 11;
const MINUTES_PAD = 2;
const WEEKDAYS = [1, 2, 3, 4, 5];
const FONT_WEIGHT_SEMIBOLD = 600;
const FONT_WEIGHT_MEDIUM = 500;
const FONT_WEIGHT_REGULAR = 400;
const FONT_WEIGHT_BOLD = 700;

const DEFAULT_TIMES: Record<Frequency, string[]> = {
  [FREQ_TWO]: ['11:00', '15:00'],
  [FREQ_THREE]: ['11:00', '14:00', '16:00'],
  [FREQ_FOUR]: ['10:00', '12:00', '14:00', '16:00'],
};

const FREQ_OPTIONS: Array<{ value: Frequency; nameKey: string; descKey: string }> = [
  { value: FREQ_TWO, nameKey: 'setupWizard.schedule.freq2Name', descKey: 'setupWizard.schedule.freq2Desc' },
  { value: FREQ_THREE, nameKey: 'setupWizard.schedule.freq3Name', descKey: 'setupWizard.schedule.freq3Desc' },
  { value: FREQ_FOUR, nameKey: 'setupWizard.schedule.freq4Name', descKey: 'setupWizard.schedule.freq4Desc' },
];

const BATCH_LABEL_KEYS: Record<Frequency, string[]> = {
  [FREQ_TWO]: ['setupWizard.schedule.batchMorning', 'setupWizard.schedule.batchAfternoon'],
  [FREQ_THREE]: [
    'setupWizard.schedule.batchMorning',
    'setupWizard.schedule.batchMidday',
    'setupWizard.schedule.batchLateAfternoon',
  ],
  [FREQ_FOUR]: [
    'setupWizard.schedule.batchMorning',
    'setupWizard.schedule.batchMidday',
    'setupWizard.schedule.batchAfternoon',
    'setupWizard.schedule.batchEvening',
  ],
};

function fmtTime(time: string): string {
  if (!time) {
    return '--:--';
  }
  const [hhStr, mmStr] = time.split(':');
  const rawHour = Number(hhStr);
  const minutes = Number(mmStr);
  if (isNaN(rawHour) || isNaN(minutes)) {
    return '--:--';
  }
  const meridiem = rawHour >= NOON_HOUR ? 'PM' : 'AM';
  const hour12 = ((rawHour + HOUR_WRAP_OFFSET) % NOON_HOUR) + 1;
  return `${hour12}:${minutes.toString().padStart(MINUTES_PAD, '0')} ${meridiem}`;
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || STRING_UTC;
  } catch {
    return STRING_UTC;
  }
}

export const ScheduleStep: React.FC<ScheduleStepProps> = ({ onComplete, onBack }) => {
  const { t } = useTranslation();
  const [frequency, setFrequency] = useState<Frequency>(FREQ_THREE);
  const [times, setTimes] = useState<string[]>(DEFAULT_TIMES[FREQ_THREE]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedTimes = useMemo(() => [...times].sort((first, second) => first.localeCompare(second)), [times]);

  const handleFrequency = (freq: Frequency) => {
    setFrequency(freq);
    setTimes(DEFAULT_TIMES[freq]);
  };

  const handleTimeChange = (idx: number, value: string) => {
    const next = [...times];
    next[idx] = value;
    setTimes(next);
  };

  const handleNext = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await axios.put(`${API_URL}/batch-schedule`, {
        deliveryDays: WEEKDAYS,
        deliveryTimes: sortedTimes,
        timezone: getLocalTimezone(),
        isEnabled: true,
        urgentBypassSchedule: true,
      });
      onComplete();
    } catch (err) {
      console.error('Failed to save batch schedule:', err);
      setError(t('setupWizard.schedule.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  const lastTime = sortedTimes[sortedTimes.length - 1];
  const firstTime = sortedTimes[0];
  const labels = BATCH_LABEL_KEYS[frequency];

  return (
    <section className="onboarding-pane" style={paneStyle}>
      <h1 className="onboarding-h1" style={h1Style}>
        {t('setupWizard.schedule.title')}
      </h1>
      <p className="onboarding-lede" style={ledeStyle}>
        {t('setupWizard.schedule.lede')}
      </p>

      <div style={labelStrongStyle}>
        <span>{t('setupWizard.schedule.howOftenLabel')}</span>
        <span style={hintStyle}>{t('setupWizard.schedule.howOftenHint')}</span>
      </div>
      <FrequencyGrid frequency={frequency} onChange={handleFrequency} t={t} />

      <div style={batchHeaderStyle}>
        <span>{t('setupWizard.schedule.batchTimesLabel')}</span>
        <span style={hintStyle}>
          {t('setupWizard.schedule.batchTimesHint', { count: sortedTimes.length })}
        </span>
      </div>
      <BatchList times={times} labels={labels} onChangeTime={handleTimeChange} t={t} />

      <div style={quietSummaryStyle}>
        <MoonIcon />
        <span>
          {t('setupWizard.schedule.quietHoursPrefix')} <b style={quietBoldStyle}>{fmtTime(lastTime)}</b>{' '}
          {t('setupWizard.schedule.quietHoursTo')} <b style={quietBoldStyle}>{fmtTime(firstTime)}</b>{' '}
          {t('setupWizard.schedule.quietHoursSuffix')}
        </span>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      <div style={actionsRowStyle}>
        <button type="button" onClick={onBack} style={ghostButtonStyle}>
          ← {t('setupWizard.common.back')}
        </button>
        <div style={spacerStyle} />
        <button onClick={handleNext} disabled={isSaving} style={primaryButtonStyle(!isSaving)}>
          {isSaving ? t('common.loading') : t('setupWizard.schedule.startLearning')}
          {!isSaving && <ArrowRight />}
        </button>
      </div>
    </section>
  );
};

interface FrequencyGridProps {
  frequency: Frequency;
  onChange: (freq: Frequency) => void;
  t: (key: string) => string;
}

const FrequencyGrid: React.FC<FrequencyGridProps> = ({ frequency, onChange, t }) => (
  <div className="onboarding-freq-grid" style={freqGridStyle}>
    {FREQ_OPTIONS.map(opt => {
      const selected = opt.value === frequency;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={freqStyle(selected)}
        >
          <div style={freqXStyle}>{opt.value}×</div>
          <div style={freqNameStyle}>{t(opt.nameKey)}</div>
          <div style={freqDescStyle}>{t(opt.descKey)}</div>
        </button>
      );
    })}
  </div>
);

interface BatchListProps {
  times: string[];
  labels: string[];
  onChangeTime: (idx: number, value: string) => void;
  t: (key: string) => string;
}

const BatchList: React.FC<BatchListProps> = ({ times, labels, onChangeTime, t }) => (
  <div style={batchListStyle}>
    {times.map((time, idx) => (
      <div key={idx} style={batchFieldStyle}>
        <span style={batchNumStyle}>{idx + 1}</span>
        <div>
          <div style={batchLabelStyle}>{t(labels[idx] ?? labels[labels.length - 1])}</div>
          <small style={batchSubLabelStyle}>{t('setupWizard.schedule.batchSubLabel')}</small>
        </div>
        <BatchTimeInput
          value={time}
          onChange={value => onChangeTime(idx, value)}
          ariaLabel={t(labels[idx] ?? labels[labels.length - 1])}
        />
      </div>
    ))}
  </div>
);

interface BatchTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const BatchTimeInput: React.FC<BatchTimeInputProps> = ({ value, onChange, ariaLabel }) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type="time"
      value={value}
      onChange={event => onChange(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={focused ? batchInputFocusStyle : batchInputStyle}
      aria-label={ariaLabel}
    />
  );
};

const MoonIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="18"
    height="18"
    style={moonIconStyle}
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
  </svg>
);

const ArrowRight: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="16" height="16">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const moonIconStyle: React.CSSProperties = { color: TOK.sunDark, flexShrink: 0 };
const paneStyle: React.CSSProperties = { display: 'block' };
const spacerStyle: React.CSSProperties = { flex: 1 };

const h1Style: React.CSSProperties = {
  fontSize: '32px',
  lineHeight: 1.1,
  letterSpacing: '-0.025em',
  fontWeight: FONT_WEIGHT_BOLD,
  margin: '0 0 12px',
};

const ledeStyle: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: 1.55,
  color: TOK.ink2,
  margin: '0 0 28px',
};

const labelStrongStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  fontSize: '13px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  color: TOK.ink2,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  margin: '0 0 10px',
};

const batchHeaderStyle: React.CSSProperties = {
  ...labelStrongStyle,
  marginTop: '8px',
};

const hintStyle: React.CSSProperties = {
  fontSize: '12px',
  color: TOK.ink3,
  fontWeight: FONT_WEIGHT_MEDIUM,
  textTransform: 'none',
  letterSpacing: 0,
};

const freqGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '10px',
  marginBottom: '24px',
};

const freqStyle = (selected: boolean): React.CSSProperties => ({
  appearance: 'none',
  cursor: 'pointer',
  padding: '18px 14px 16px',
  textAlign: 'center',
  background: selected ? TOK.sunPale : '#fff',
  border: `1.5px solid ${selected ? TOK.sun : TOK.line2}`,
  borderRadius: '14px',
  transition: 'border-color .15s, background .15s',
});

const freqXStyle: React.CSSProperties = {
  fontFamily: TOK.fontSerif,
  fontSize: '36px',
  lineHeight: 1,
  color: TOK.sunDark,
};

const freqNameStyle: React.CSSProperties = {
  fontSize: '13.5px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  marginTop: '8px',
  color: TOK.ink,
};

const freqDescStyle: React.CSSProperties = {
  fontSize: '11.5px',
  color: TOK.ink3,
  marginTop: '2px',
};

const batchListStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  marginBottom: '16px',
};

const batchFieldStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px 1fr auto',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 14px',
  background: '#fff',
  border: `1.5px solid ${TOK.line2}`,
  borderRadius: '12px',
};

const batchNumStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  borderRadius: '999px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  display: 'grid',
  placeItems: 'center',
  fontSize: '12px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  color: TOK.ink2,
  fontFamily: TOK.fontMono,
};

const batchLabelStyle: React.CSSProperties = {
  fontSize: '13.5px',
  color: TOK.ink2,
  fontWeight: FONT_WEIGHT_MEDIUM,
};

const batchSubLabelStyle: React.CSSProperties = {
  display: 'block',
  color: TOK.ink4,
  fontWeight: FONT_WEIGHT_REGULAR,
  marginTop: '1px',
  fontSize: '11.5px',
};

const batchInputStyle: React.CSSProperties = {
  border: `1px solid ${TOK.line2}`,
  outline: 0,
  background: TOK.cream,
  font: 'inherit',
  fontSize: '14px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  color: TOK.ink,
  width: '150px',
  minWidth: 0,
  padding: '8px 12px',
  borderRadius: '8px',
  fontFamily: TOK.fontMono,
  cursor: 'text',
  transition: 'background 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
};

const batchInputFocusStyle: React.CSSProperties = {
  ...batchInputStyle,
  background: '#FFFFFF',
  border: `1px solid ${TOK.sun}`,
  boxShadow: `0 0 0 3px ${TOK.sunPale}`,
};

const quietSummaryStyle: React.CSSProperties = {
  padding: '12px 14px',
  marginBottom: '20px',
  background: TOK.cream2,
  border: `1px solid ${TOK.line}`,
  borderRadius: '10px',
  fontSize: '13px',
  color: TOK.ink2,
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const quietBoldStyle: React.CSSProperties = { color: TOK.ink, fontWeight: FONT_WEIGHT_SEMIBOLD };

const errorStyle: React.CSSProperties = {
  marginTop: '12px',
  padding: '10px 14px',
  background: '#FCEAEA',
  border: '1px solid #F4C7C7',
  borderRadius: '10px',
  color: '#A33A3A',
  fontSize: '13px',
};

const actionsRowStyle: React.CSSProperties = {
  marginTop: '28px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const ghostButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '48px',
  padding: '0 14px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  background: 'transparent',
  color: TOK.ink2,
  border: '1.5px solid transparent',
  cursor: 'pointer',
};

const primaryButtonStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '48px',
  padding: '0 22px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  border: `1.5px solid ${enabled ? TOK.sun : TOK.sunPale2}`,
  background: enabled ? TOK.sun : TOK.sunPale2,
  color: '#fff',
  cursor: enabled ? 'pointer' : 'not-allowed',
  boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.12)',
});
