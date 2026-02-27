import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

const T = {
  border: '#E5E7EB', text: '#111827', textSec: '#6B7280', textTer: '#9CA3AF',
  sp: { xs: '4px', sm: '8px', md: '16px' },
  r: { sm: '4px', md: '8px' },
  f: { xs: '11px', sm: '13px', base: '15px' },
};
const ACCENT = '#D97706';
const ACCENT_BG = '#FFFBEB';

const SAMPLE_SUMMARY = `The sender is following up on last week's discussion about the Monash Grand Prix event. Key points:

• The event is scheduled for March 15th at the main campus
• They need confirmation of catering arrangements by Thursday
• The budget has been approved, pending final sign-off from finance
• Three team members need to be assigned to registration duties`;

interface SumProps { summary?: string | null; loading?: boolean; processing?: boolean; defaultCollapsed?: boolean }

const SumSection = ({ summary, loading, processing, defaultCollapsed = false }: SumProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [type, setType] = useState('tldr');

  return (
    <div style={{ maxWidth: 640, borderRadius: T.r.md, border: `1px solid ${T.border}`, overflow: 'hidden', marginBottom: T.sp.md }}>
      <button onClick={() => setCollapsed(!collapsed)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: T.sp.sm, padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: ACCENT_BG, border: 'none', borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer', textAlign: 'left' as const }}>
        <span style={{ fontSize: '16px' }}>📋</span>
        <span style={{ flex: 1, fontSize: T.f.sm, fontWeight: 600, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>AI Summary</span>
        {!loading && !processing && summary && (
          <span style={{ fontSize: T.f.xs, color: T.textSec, display: 'flex', gap: T.sp.xs }}>
            {['tldr', 'bullets', 'action-focused'].map(t => (
              <span key={t} onClick={(e) => { e.stopPropagation(); setType(t); }} style={{ padding: '2px 8px', borderRadius: 999, backgroundColor: type === t ? ACCENT : 'transparent', color: type === t ? '#fff' : T.textSec, cursor: 'pointer', fontSize: T.f.xs, fontWeight: 500 }}>
                {t === 'tldr' ? 'TL;DR' : t === 'bullets' ? 'Bullets' : 'Actions'}
              </span>
            ))}
          </span>
        )}
        <span style={{ fontSize: T.f.xs, color: T.textSec, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </button>
      {!collapsed && (
        <div style={{ padding: T.sp.md, backgroundColor: '#FFFFFF' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, color: T.textSec, fontSize: T.f.sm }}>
              <span>⏳</span> Generating summary…
            </div>
          ) : processing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.sm, color: T.textSec, fontSize: T.f.sm }}>
              <span>⚙️</span> Processing email…
            </div>
          ) : summary ? (
            <p style={{ margin: 0, fontSize: T.f.base, color: T.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' as const }}>{summary}</p>
          ) : (
            <div style={{ color: T.textSec, fontSize: T.f.sm }}>No summary available. <button style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontWeight: 600 }}>Generate one →</button></div>
          )}
        </div>
      )}
    </div>
  );
};

const meta = { title: 'Email Detail/SummarySection', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const WithSummary: Story = { render: () => <SumSection summary={SAMPLE_SUMMARY} /> };
export const Loading: Story = { render: () => <SumSection loading /> };
export const ProcessingEmail: Story = { render: () => <SumSection processing /> };
export const NoSummary: Story = { render: () => <SumSection summary={null} /> };
export const Collapsed: Story = { render: () => <SumSection summary={SAMPLE_SUMMARY} defaultCollapsed /> };
