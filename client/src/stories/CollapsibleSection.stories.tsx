/**
 * CollapsibleSection stories — uses the real CollapsibleSection component.
 * Previously used an inlined fake; updated to import the real component (issue #1219).
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { COLOR_SUCCESS_MED, COLOR_WARNING_MED } from 'constants/colors';

import { CollapsibleDemo } from './storyHelpers/CollapsibleDemo';

const meta: Meta = {
  title: 'Components/CollapsibleSection',
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj;

export const SummaryAmber: Story = {
  name: 'AI Summary (amber)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CollapsibleDemo title="AI Summary" accent="#D97706" accentBg="#FFFBEB" icon="📋">
        <p style={{ margin: 0, fontSize: '15px', color: '#111827', lineHeight: 1.6 }}>
          The sender is following up about the Monash Grand Prix event. Catering must be confirmed by Thursday, budget
          sign-off is pending, and 3 team members need assigning to registration.
        </p>
      </CollapsibleDemo>
    </div>
  ),
};

export const PrivateNotesPurple: Story = {
  name: 'Private Notes (purple)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CollapsibleDemo title="Private Notes" accent="#7C3AED" accentBg="#F5F3FF" icon="📝">
        <textarea
          style={{
            width: '100%',
            minHeight: 80,
            padding: '8px',
            border: '1px solid #E5E7EB',
            borderRadius: '4px',
            fontSize: '15px',
            color: '#111827',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
          defaultValue="Follow up with Alice about the budget by Tuesday."
        />
      </CollapsibleDemo>
    </div>
  ),
};

export const ActionItemsGreen: Story = {
  name: 'Action Items (green)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CollapsibleDemo title="Action Items" accent="#16A34A" accentBg="#F0FDF4" icon="✅">
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
                gap: '8px',
                padding: '4px 0',
                borderBottom: '1px solid #E5E7EB',
              }}
            >
              <input type="checkbox" style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: '15px', color: '#111827' }}>{item}</span>
            </li>
          ))}
        </ul>
      </CollapsibleDemo>
    </div>
  ),
};

export const GitHubDark: Story = {
  name: 'GitHub Status (dark)',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CollapsibleDemo title="GitHub Status" accent="#1F2937" accentBg="#F9FAFB" icon="🐙">
        <div
          style={{
            fontSize: '13px',
            color: '#6B7280',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
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
      </CollapsibleDemo>
    </div>
  ),
};

export const CollapsedWithPreview: Story = {
  name: 'Collapsed with preview',
  render: () => (
    <div style={{ maxWidth: 600 }}>
      <CollapsibleDemo
        title="AI Summary"
        accent="#D97706"
        accentBg="#FFFBEB"
        icon="📋"
        defaultCollapsed
        preview="Monash Grand Prix event — catering, budget sign-off, 3 team members for registration."
      >
        <p style={{ margin: 0, fontSize: '15px', color: '#111827' }}>Full summary content here.</p>
      </CollapsibleDemo>
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
        <CollapsibleDemo key={title} title={title} accent={accent} accentBg={bg} icon={icon}>
          <p style={{ margin: 0, fontSize: '15px', color: '#111827' }}>{content}</p>
        </CollapsibleDemo>
      ))}
    </div>
  ),
};
