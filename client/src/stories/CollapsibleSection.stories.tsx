import React, { useState } from 'react';
import type { StoryObj } from '@storybook/react';

import { COLOR_SUCCESS_MED, COLOR_WARNING_MED, COLOR_WHITE_FULL } from 'constants/colors';

const Th = {
  border: '#E5E7EB',
  text: '#111827',
  textSec: '#6B7280',
  sp: { xs: '4px', sm: '8px', md: '16px' },
  r: { sm: '4px', md: '8px' },
  f: { xs: '11px', sm: '13px', base: '15px' },
};

interface CSProps {
  title: string;
  accent: string;
  accentBg: string;
  icon?: string;
  preview?: string;
  defaultCollapsed?: boolean;
  children?: React.ReactNode;
}

const CS = ({ title, accent, accentBg, icon, preview, defaultCollapsed = false, children }: CSProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div
      style={{ marginBottom: Th.sp.md, borderRadius: Th.r.md, border: `1px solid ${Th.border}`, overflow: 'hidden' }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: Th.sp.sm,
          padding: `${Th.sp.sm} ${Th.sp.md}`,
          backgroundColor: accentBg,
          border: 'none',
          borderLeft: `3px solid ${accent}`,
          cursor: 'pointer',
          textAlign: 'left' as const,
        }}
      >
        {icon && <span style={{ fontSize: '16px' }}>{icon}</span>}
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
          {title}
        </span>
        {collapsed && preview && (
          <span
            style={{
              fontSize: Th.f.xs,
              color: Th.textSec,
              maxWidth: 240,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {preview}
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
      {!collapsed && <div style={{ padding: Th.sp.md, backgroundColor: COLOR_WHITE_FULL }}>{children}</div>}
    </div>
  );
};

const meta = { title: 'Components/CollapsibleSection', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const SummaryAmber: Story = {
  name: 'AI Summary (amber)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CS title="AI Summary" accent="#D97706" accentBg="#FFFBEB" icon="📋">
        <p style={{ margin: 0, fontSize: Th.f.base, color: Th.text, lineHeight: 1.6 }}>
          The sender is following up about the Monash Grand Prix event. Catering must be confirmed by Thursday, budget
          sign-off is pending, and 3 team members need assigning to registration.
        </p>
      </CS>
    </div>
  ),
};

export const PrivateNotesPurple: Story = {
  name: 'Private Notes (purple)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CS title="Private Notes" accent="#7C3AED" accentBg="#F5F3FF" icon="📝">
        <textarea
          style={{
            width: '100%',
            minHeight: 80,
            padding: Th.sp.sm,
            border: `1px solid ${Th.border}`,
            borderRadius: Th.r.sm,
            fontSize: Th.f.base,
            color: Th.text,
            resize: 'vertical',
            boxSizing: 'border-box' as const,
          }}
          defaultValue="Follow up with Alice about the budget by Tuesday."
        />
      </CS>
    </div>
  ),
};

export const ActionItemsGreen: Story = {
  name: 'Action Items (green)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CS title="Action Items" accent="#16A34A" accentBg="#F0FDF4" icon="✅">
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {[
            'Confirm catering by Thursday',
            'Get budget sign-off from finance',
            'Assign 3 team members to registration',
          ].map(item => (
            <li
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: Th.sp.sm,
                padding: `${Th.sp.xs} 0`,
                borderBottom: `1px solid ${Th.border}`,
              }}
            >
              <input type="checkbox" style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: Th.f.base, color: Th.text }}>{item}</span>
            </li>
          ))}
        </ul>
      </CS>
    </div>
  ),
};

export const GitHubDark: Story = {
  name: 'GitHub Status (dark)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CS title="GitHub Status" accent="#1F2937" accentBg="#F9FAFB" icon="🐙">
        <div
          style={{
            fontSize: Th.f.sm,
            color: Th.textSec,
            display: 'flex',
            flexDirection: 'column' as const,
            gap: Th.sp.sm,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>PR #421 — Fix email threading</span>
            <span style={{ color: COLOR_SUCCESS_MED, fontWeight: 600 }}>Merged</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Issue #88 — Snooze not working</span>
            <span style={{ color: COLOR_WARNING_MED, fontWeight: 600 }}>Open</span>
          </div>
        </div>
      </CS>
    </div>
  ),
};

export const CollapsedWithPreview: Story = {
  name: 'Collapsed with preview',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CS
        title="AI Summary"
        accent="#D97706"
        accentBg="#FFFBEB"
        icon="📋"
        defaultCollapsed
        preview="Monash Grand Prix event — catering, budget sign-off, 3 team members for registration."
      >
        <p style={{ margin: 0, fontSize: Th.f.base, color: Th.text }}>Full summary content here.</p>
      </CS>
    </div>
  ),
};

export const AllStacked: Story = {
  name: 'All four sections stacked',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      {[
        {
          title: 'AI Summary',
          accent: '#D97706',
          bg: '#FFFBEB',
          icon: '📋',
          content: 'Grand Prix event — catering by Thursday, budget sign-off pending, assign 3 team members.',
        },
        {
          title: 'Private Notes',
          accent: '#7C3AED',
          bg: '#F5F3FF',
          icon: '📝',
          content: 'Follow up with Alice about the budget by Tuesday.',
        },
        {
          title: 'Action Items',
          accent: '#16A34A',
          bg: '#F0FDF4',
          icon: '✅',
          content: '3 items: Confirm catering, Get sign-off, Assign team members.',
        },
        {
          title: 'GitHub Status',
          accent: '#1F2937',
          bg: '#F9FAFB',
          icon: '🐙',
          content: 'PR #421 merged. Issue #88 open.',
        },
      ].map(({ title, accent, bg, icon, content }) => (
        <CS key={title} title={title} accent={accent} accentBg={bg} icon={icon}>
          <p style={{ margin: 0, fontSize: Th.f.base, color: Th.text }}>{content}</p>
        </CS>
      ))}
    </div>
  ),
};
