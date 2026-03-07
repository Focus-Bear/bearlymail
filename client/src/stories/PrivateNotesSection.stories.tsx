import React, { useState } from 'react';
import type { StoryObj } from '@storybook/react';

import { COLOR_WHITE, COLOR_WHITE_FULL } from 'constants/colors';

const Th = {
  border: '#E5E7EB', text: '#111827', textSec: '#6B7280',
  sp: { xs: '4px', sm: '8px', md: '16px' },
  r: { sm: '4px', md: '8px' },
  f: { xs: '11px', sm: '13px', base: '15px' },
};
const ACCENT = '#7C3AED';
const ACCENT_BG = '#F5F3FF';

interface NotesProps { initialContent?: string; defaultCollapsed?: boolean }

const NotesSection = ({ initialContent = '', defaultCollapsed = false }: NotesProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [content, setContent] = useState(initialContent);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    console.log('Note saved:', content);
  };

  return (
    <div style={{ maxWidth: 640, borderRadius: Th.r.md, border: `1px solid ${Th.border}`, overflow: 'hidden', marginBottom: Th.sp.md }}>
      <button onClick={() => setCollapsed(!collapsed)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: Th.sp.sm, padding: `${Th.sp.sm} ${Th.sp.md}`, backgroundColor: ACCENT_BG, border: 'none', borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer', textAlign: 'left' as const }}>
        <span style={{ fontSize: '16px' }}>📝</span>
        <span style={{ flex: 1, fontSize: Th.f.sm, fontWeight: 600, color: Th.text, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Private Notes</span>
        {collapsed && content && <span style={{ fontSize: Th.f.xs, color: Th.textSec, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{content}</span>}
        <span style={{ fontSize: Th.f.xs, color: Th.textSec, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </button>
      {!collapsed && (
        <div style={{ padding: Th.sp.md, backgroundColor: COLOR_WHITE_FULL }}>
          <textarea
            value={content}
            onChange={event => setContent(event.target.value)}
            placeholder="Add a private note… only you can see this."
            style={{ width: '100%', minHeight: 100, padding: Th.sp.sm, border: `1px solid ${Th.border}`, borderRadius: Th.r.sm, fontSize: Th.f.base, color: Th.text, resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'inherit', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: Th.sp.sm }}>
            <button onClick={handleSave} style={{ padding: `${Th.sp.xs} ${Th.sp.md}`, backgroundColor: ACCENT, color: COLOR_WHITE, border: 'none', borderRadius: Th.r.sm, cursor: 'pointer', fontSize: Th.f.sm, fontWeight: 600 }}>
              {saved ? '✓ Saved' : 'Save note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const meta = { title: 'Email Detail/PrivateNotesSection', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const Empty: Story = { render: () => <NotesSection /> };
export const WithContent: Story = {
  render: () => <NotesSection initialContent="Follow up with Alice about the budget proposal. She mentioned the finance team needs the breakdown by end of week. Also check in with Bob re: catering headcount." />,
};
export const Collapsed: Story = {
  render: () => <NotesSection initialContent="Follow up with Alice about the budget proposal." defaultCollapsed />,
};
export const CollapsedEmpty: Story = { render: () => <NotesSection defaultCollapsed /> };
