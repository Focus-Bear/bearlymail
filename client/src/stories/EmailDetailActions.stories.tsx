import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

const T = {
  border: '#E5E7EB', text: '#111827', textSec: '#6B7280',
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

interface ActionBarProps { initialPriority?: number; showSnooze?: boolean }

const ActionBar = ({ initialPriority = 0, showSnooze: initSnooze = false }: ActionBarProps) => {
  const [starCount, setStarCount] = useState(initialPriority);
  const [showSnooze, setShowSnooze] = useState(initSnooze);
  const [snoozePick, setSnoozePick] = useState('');

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: T.r.md, border: `1px solid ${T.border}`, padding: T.sp.md, display: 'flex', flexDirection: 'column' as const, gap: T.sp.md }}>
        <div style={{ display: 'flex', gap: T.sp.sm, alignItems: 'center', flexWrap: 'wrap' as const }}>
          <button style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: T.text, color: '#fff', border: 'none', borderRadius: T.r.md, fontWeight: 600, cursor: 'pointer', fontSize: T.f.sm }}>
            ↩ Reply All
          </button>
          <button style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: 'transparent', color: T.textSec, border: `1px solid ${T.border}`, borderRadius: T.r.md, fontWeight: 500, cursor: 'pointer', fontSize: T.f.sm }}>
            ↪ Forward
          </button>
          <div style={{ width: 1, height: 28, backgroundColor: T.border, flexShrink: 0 }} />
          <button onClick={() => alert('Archived!')} style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: 'transparent', color: T.textSec, border: 'none', borderRadius: T.r.md, cursor: 'pointer', fontSize: T.f.sm }}>
            📦 Archive
          </button>
          <button onClick={() => setShowSnooze(!showSnooze)} style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: showSnooze ? '#FFF7ED' : 'transparent', color: showSnooze ? PRIMARY : T.textSec, border: showSnooze ? `1px solid ${PRIMARY}` : 'none', borderRadius: T.r.md, cursor: 'pointer', fontSize: T.f.sm }}>
            🕐 Snooze
          </button>
        </div>

        {showSnooze && (
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: T.sp.md }}>
            <div style={{ fontSize: T.f.xs, color: T.textSec, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: T.sp.sm }}>Snooze until</div>
            <div style={{ display: 'flex', gap: T.sp.sm, flexWrap: 'wrap' as const }}>
              {SNOOZE_OPTIONS.map(({ label, value }) => (
                <button key={value} onClick={() => setSnoozePick(value)} style={{ padding: `${T.sp.xs} ${T.sp.md}`, backgroundColor: snoozePick === value ? '#FFF7ED' : 'transparent', color: snoozePick === value ? PRIMARY : T.textSec, border: `1px solid ${snoozePick === value ? PRIMARY : T.border}`, borderRadius: T.r.full, cursor: 'pointer', fontSize: T.f.sm, fontWeight: 500 }}>
                  {label}
                </button>
              ))}
            </div>
            {snoozePick && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: T.sp.sm, marginTop: T.sp.sm }}>
                <button onClick={() => { setShowSnooze(false); setSnoozePick(''); }} style={{ padding: `${T.sp.xs} ${T.sp.md}`, background: 'none', border: `1px solid ${T.border}`, borderRadius: T.r.sm, cursor: 'pointer', fontSize: T.f.sm, color: T.textSec }}>Cancel</button>
                <button onClick={() => { alert(`Snoozed: ${snoozePick}`); setShowSnooze(false); setSnoozePick(''); }} style={{ padding: `${T.sp.xs} ${T.sp.md}`, backgroundColor: PRIMARY, color: '#fff', border: 'none', borderRadius: T.r.sm, cursor: 'pointer', fontSize: T.f.sm, fontWeight: 600 }}>Confirm snooze</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.md, paddingTop: T.sp.sm, borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: T.f.xs, color: T.textSec, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, flexShrink: 0 }}>Prioritize</span>
          <div style={{ display: 'flex', gap: T.sp.xs }}>
            {PRIORITY_OPTIONS.map(({ label, emoji, value }) => {
              const active = starCount === value;
              return (
                <button key={value} onClick={() => setStarCount(starCount === value ? 0 : value)} style={{ padding: `${T.sp.xs} ${T.sp.md}`, backgroundColor: active ? T.text : 'transparent', color: active ? '#fff' : T.textSec, border: `1px solid ${active ? T.text : T.border}`, borderRadius: T.r.full, cursor: 'pointer', fontSize: T.f.sm, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{emoji}</span><span>{label}</span>
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
