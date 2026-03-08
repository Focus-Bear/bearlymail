import React, { useState } from 'react';
import type { StoryObj } from '@storybook/react';

import { COLOR_TRANSPARENT, COLOR_WHITE, COLOR_WHITE_FULL } from 'constants/colors';

const Th = {
  border: '#E5E7EB',
  text: '#111827',
  textSec: '#6B7280',
  sp: { xs: '4px', sm: '8px', md: '16px' },
  r: { sm: '4px', md: '8px', full: '999px' },
  f: { xs: '11px', sm: '13px', base: '15px' },
};
const PRIMARY = '#E9902C';

const PRIORITY_OPTIONS = [
  { label: 'Can wait', emoji: '😊', value: 1 },
  { label: 'Get on it', emoji: '😀', value: 2 },
  { label: 'Oh sh$t', emoji: '🤯', value: 3 },
];

const SNOOZE_OPTIONS = [
  { label: 'Tomorrow morning', value: 'tomorrow' },
  { label: 'This weekend', value: 'weekend' },
  { label: 'Next week', value: 'next-week' },
  { label: 'In 2 weeks', value: '2-weeks' },
  { label: 'Custom date…', value: 'custom' },
];

interface ActionBarProps {
  initialPriority?: number;
  showSnooze?: boolean;
}

const ActionBar = ({ initialPriority = 0, showSnooze: initSnooze = false }: ActionBarProps) => {
  const [starCount, setStarCount] = useState(initialPriority);
  const [showSnooze, setShowSnooze] = useState(initSnooze);
  const [snoozePick, setSnoozePick] = useState('');

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          backgroundColor: COLOR_WHITE_FULL,
          borderRadius: Th.r.md,
          border: `1px solid ${Th.border}`,
          padding: Th.sp.md,
          display: 'flex',
          flexDirection: 'column' as const,
          gap: Th.sp.md,
        }}
      >
        <div style={{ display: 'flex', gap: Th.sp.sm, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button
            style={{
              padding: `${Th.sp.sm} ${Th.sp.md}`,
              backgroundColor: Th.text,
              color: COLOR_WHITE,
              border: 'none',
              borderRadius: Th.r.md,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: Th.f.sm,
            }}
          >
            ↩ Reply All
          </button>
          <button
            style={{
              padding: `${Th.sp.sm} ${Th.sp.md}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: Th.textSec,
              border: `1px solid ${Th.border}`,
              borderRadius: Th.r.md,
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: Th.f.sm,
            }}
          >
            ↪ Forward
          </button>
          <div style={{ width: 1, height: 28, backgroundColor: Th.border, flexShrink: 0 }} />
          <button
            onClick={() => {
              /* archive action placeholder */
            }}
            style={{
              padding: `${Th.sp.sm} ${Th.sp.md}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: Th.textSec,
              border: 'none',
              borderRadius: Th.r.md,
              cursor: 'pointer',
              fontSize: Th.f.sm,
            }}
          >
            📦 Archive
          </button>
          <button
            onClick={() => setShowSnooze(!showSnooze)}
            style={{
              padding: `${Th.sp.sm} ${Th.sp.md}`,
              backgroundColor: showSnooze ? '#FFF7ED' : 'transparent',
              color: showSnooze ? PRIMARY : Th.textSec,
              border: showSnooze ? `1px solid ${PRIMARY}` : 'none',
              borderRadius: Th.r.md,
              cursor: 'pointer',
              fontSize: Th.f.sm,
            }}
          >
            🕐 Snooze
          </button>
        </div>

        {showSnooze && (
          <div style={{ borderTop: `1px solid ${Th.border}`, paddingTop: Th.sp.md }}>
            <div
              style={{
                fontSize: Th.f.xs,
                color: Th.textSec,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                marginBottom: Th.sp.sm,
              }}
            >
              Snooze until
            </div>
            <div style={{ display: 'flex', gap: Th.sp.sm, flexWrap: 'wrap' as const }}>
              {SNOOZE_OPTIONS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setSnoozePick(value)}
                  style={{
                    padding: `${Th.sp.xs} ${Th.sp.md}`,
                    backgroundColor: snoozePick === value ? '#FFF7ED' : 'transparent',
                    color: snoozePick === value ? PRIMARY : Th.textSec,
                    border: `1px solid ${snoozePick === value ? PRIMARY : Th.border}`,
                    borderRadius: Th.r.full,
                    cursor: 'pointer',
                    fontSize: Th.f.sm,
                    fontWeight: 500,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {snoozePick && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: Th.sp.sm, marginTop: Th.sp.sm }}>
                <button
                  onClick={() => {
                    setShowSnooze(false);
                    setSnoozePick('');
                  }}
                  style={{
                    padding: `${Th.sp.xs} ${Th.sp.md}`,
                    background: 'none',
                    border: `1px solid ${Th.border}`,
                    borderRadius: Th.r.sm,
                    cursor: 'pointer',
                    fontSize: Th.f.sm,
                    color: Th.textSec,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSnooze(false);
                    setSnoozePick('');
                  }}
                  style={{
                    padding: `${Th.sp.xs} ${Th.sp.md}`,
                    backgroundColor: PRIMARY,
                    color: COLOR_WHITE,
                    border: 'none',
                    borderRadius: Th.r.sm,
                    cursor: 'pointer',
                    fontSize: Th.f.sm,
                    fontWeight: 600,
                  }}
                >
                  Confirm snooze
                </button>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: Th.sp.md,
            paddingTop: Th.sp.sm,
            borderTop: `1px solid ${Th.border}`,
          }}
        >
          <span
            style={{
              fontSize: Th.f.xs,
              color: Th.textSec,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase' as const,
              flexShrink: 0,
            }}
          >
            Prioritize
          </span>
          <div style={{ display: 'flex', gap: Th.sp.xs }}>
            {PRIORITY_OPTIONS.map(({ label, emoji, value }) => {
              const active = starCount === value;
              return (
                <button
                  key={value}
                  onClick={() => setStarCount(starCount === value ? 0 : value)}
                  style={{
                    padding: `${Th.sp.xs} ${Th.sp.md}`,
                    backgroundColor: active ? Th.text : 'transparent',
                    color: active ? '#fff' : Th.textSec,
                    border: `1px solid ${active ? Th.text : Th.border}`,
                    borderRadius: Th.r.full,
                    cursor: 'pointer',
                    fontSize: Th.f.sm,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>{emoji}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const meta = { title: 'Email Detail/Action Bar', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <ActionBar /> };
export const HighPriority: Story = { name: 'Priority: Oh sh$t', render: () => <ActionBar initialPriority={3} /> };
export const MediumPriority: Story = { name: 'Priority: Get on it', render: () => <ActionBar initialPriority={2} /> };
export const LowPriority: Story = { name: 'Priority: Can wait', render: () => <ActionBar initialPriority={1} /> };
export const SnoozeOpen: Story = { name: 'Snooze panel open', render: () => <ActionBar showSnooze /> };
