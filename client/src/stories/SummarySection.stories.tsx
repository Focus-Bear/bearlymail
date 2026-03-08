import React, { useState } from 'react';
import type { StoryObj } from '@storybook/react';

import { COLOR_WHITE_FULL } from 'constants/colors';

const Th = {
  border: '#E5E7EB',
  text: '#111827',
  textSec: '#6B7280',
  textTer: '#9CA3AF',
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

interface SumProps {
  summary?: string | null;
  loading?: boolean;
  processing?: boolean;
  defaultCollapsed?: boolean;
}

const SumSection = ({ summary, loading, processing, defaultCollapsed = false }: SumProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [type, setType] = useState('tldr');

  return (
    <div
      style={{
        maxWidth: 640,
        borderRadius: Th.r.md,
        border: `1px solid ${Th.border}`,
        overflow: 'hidden',
        marginBottom: Th.sp.md,
      }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: Th.sp.sm,
          padding: `${Th.sp.sm} ${Th.sp.md}`,
          backgroundColor: ACCENT_BG,
          border: 'none',
          borderLeft: `3px solid ${ACCENT}`,
          cursor: 'pointer',
          textAlign: 'left' as const,
        }}
      >
        <span style={{ fontSize: '16px' }}>📋</span>
        <span
          style={{
            flex: 1,
            fontSize: Th.f.sm,
            fontWeight: 600,
            color: Th.text,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.06em',
          }}
        >
          AI Summary
        </span>
        {!loading && !processing && summary && (
          <span style={{ fontSize: Th.f.xs, color: Th.textSec, display: 'flex', gap: Th.sp.xs }}>
            {['tldr', 'bullets', 'action-focused'].map(item => (
              <span
                key={item}
                onClick={event => {
                  event.stopPropagation();
                  setType(item);
                }}
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  backgroundColor: type === item ? ACCENT : 'transparent',
                  color: type === item ? '#fff' : Th.textSec,
                  cursor: 'pointer',
                  fontSize: Th.f.xs,
                  fontWeight: 500,
                }}
              >
                {(() => {
                  if (item === 'tldr') {
                    return 'TL;DR';
                  }
                  if (item === 'bullets') {
                    return 'Bullets';
                  }
                  return 'Actions';
                })()}
              </span>
            ))}
          </span>
        )}
        <span
          style={{
            fontSize: Th.f.xs,
            color: Th.textSec,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      </button>
      {!collapsed && (
        <div style={{ padding: Th.sp.md, backgroundColor: COLOR_WHITE_FULL }}>
          {(() => {
            if (loading) {
              return (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: Th.sp.sm, color: Th.textSec, fontSize: Th.f.sm }}
                >
                  <span>⏳</span> Generating summary…
                </div>
              );
            }
            if (processing) {
              return (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: Th.sp.sm, color: Th.textSec, fontSize: Th.f.sm }}
                >
                  <span>⚙️</span> Processing email…
                </div>
              );
            }
            if (summary) {
              return (
                <p
                  style={{
                    margin: 0,
                    fontSize: Th.f.base,
                    color: Th.text,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap' as const,
                  }}
                >
                  {summary}
                </p>
              );
            }
            return (
              <div style={{ color: Th.textSec, fontSize: Th.f.sm }}>
                No summary available.{' '}
                <button
                  style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontWeight: 600 }}
                >
                  Generate one →
                </button>
              </div>
            );
          })()}
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
