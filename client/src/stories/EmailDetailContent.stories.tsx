import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

const T = {
  border: '#E5E7EB', text: '#111827', textSec: '#6B7280',
  sp: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
  r: { sm: '4px', md: '8px', lg: '12px', full: '999px' },
  f: { xs: '11px', sm: '13px', base: '15px', lg: '18px' },
};
const PRIMARY = '#E9902C';

const PRIORITY_OPTIONS = [
  { label: 'Can wait', emoji: '😊', value: 1 },
  { label: 'Get on it', emoji: '😀', value: 2 },
  { label: 'Oh sh$t', emoji: '🤯', value: 3 },
];

const SAMPLE_SUMMARY = `The sender is following up on the Monash Grand Prix event. Key points:

• Event is scheduled for March 15th at the main campus
• Catering needs to be confirmed by Thursday
• Budget approved, pending final finance sign-off
• 3 team members need assigning to registration duties`;

const SAMPLE_ITEMS = [
  { id: '1', description: 'Confirm catering arrangements by Thursday', isCompleted: false },
  { id: '2', description: 'Get final sign-off from finance team', isCompleted: true },
  { id: '3', description: 'Assign 3 team members to registration duties', isCompleted: false },
];

const GITHUB_ITEMS = [
  { label: 'PR #421 — Fix email threading', status: 'Merged', color: '#16A34A' },
  { label: 'Issue #88 — Snooze not resetting', status: 'Open', color: '#D97706' },
  { label: 'PR #418 — Add GitHub section', status: 'Draft', color: '#6B7280' },
];

const CS = ({ title, accent, accentBg, icon, collapsed, onToggle, preview, children }: any) => (
  <div style={{ marginBottom: T.sp.md, borderRadius: T.r.md, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
    <button
      onClick={onToggle}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: T.sp.sm, padding: `10px ${T.sp.md}`, backgroundColor: accentBg, border: 'none', borderLeft: `4px solid ${accent}`, cursor: 'pointer', textAlign: 'left' as const }}
    >
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{icon}</span>
      <strong style={{ fontSize: T.f.sm, fontWeight: 700, color: accent, textTransform: 'uppercase' as const, letterSpacing: '0.06em', flexShrink: 0 }}>{title}</strong>
      {collapsed && preview && (
        <span style={{ fontSize: T.f.sm, color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginLeft: T.sp.xs, flex: 1 }}>
          {preview}
        </span>
      )}
      {!collapsed && <span style={{ flex: 1 }} />}
      <span style={{ fontSize: 10, color: T.textSec, flexShrink: 0 }}>{collapsed ? '▶' : '▼'}</span>
    </button>
    {!collapsed && <div style={{ padding: T.sp.md, backgroundColor: '#FFFFFF' }}>{children}</div>}
  </div>
);

interface PanelProps { priority?: number; note?: string; allCollapsed?: boolean }

const FullPanel = ({ priority = 0, note = '', allCollapsed = false }: PanelProps) => {
  const [starCount, setStarCount] = useState(priority);
  const [showSnooze, setShowSnooze] = useState(false);
  const [sumCollapsed, setSumCollapsed] = useState(allCollapsed);
  const [noteContent, setNoteContent] = useState(note);
  const [notesCollapsed, setNotesCollapsed] = useState(allCollapsed);
  const [actionsCollapsed, setActionsCollapsed] = useState(allCollapsed);
  const [githubCollapsed, setGithubCollapsed] = useState(allCollapsed);
  const [items, setItems] = useState(SAMPLE_ITEMS);
  const [newItem, setNewItem] = useState('');

  const addItem = () => {
    if (!newItem.trim()) return;
    setItems(prev => [...prev, { id: `i-${Date.now()}`, description: newItem, isCompleted: false }]);
    setNewItem('');
  };

  const doneCnt = items.filter(i => i.isCompleted).length;
  const summaryPreview = SAMPLE_SUMMARY.split('\n')[0];
  const notesPreview = noteContent.trim() ? noteContent.trim().slice(0, 60) + (noteContent.length > 60 ? '…' : '') : 'No notes yet';
  const actionsPreview = items.length === 0 ? 'No items' : `${doneCnt}/${items.length} done`;
  const githubPreview = `${GITHUB_ITEMS.filter(g => g.status === 'Open').length} open · ${GITHUB_ITEMS.filter(g => g.status === 'Merged').length} merged`;

  return (
    <div style={{ maxWidth: 680, border: `1px solid ${T.border}`, borderRadius: T.r.lg, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
      <div style={{ padding: T.sp.xl }}>
        <div style={{ marginBottom: T.sp.lg, paddingBottom: T.sp.md, borderBottom: `1px solid ${T.border}` }}>
          <h2 style={{ margin: 0, fontSize: T.f.lg, fontWeight: 600, color: T.text }}>Monash at the Grand Prix - Weekly Update</h2>
          <div style={{ fontSize: T.f.sm, color: T.textSec, marginTop: 4 }}>From: Alice Smith &lt;alice@example.com&gt; · 2 hours ago</div>
        </div>

        <div style={{ backgroundColor: '#FAFAFA', borderRadius: T.r.md, border: `1px solid ${T.border}`, padding: T.sp.md, marginBottom: T.sp.lg, display: 'flex', flexDirection: 'column' as const, gap: T.sp.md }}>
          <div style={{ display: 'flex', gap: T.sp.sm, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <button style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: T.text, color: '#fff', border: 'none', borderRadius: T.r.md, fontWeight: 600, cursor: 'pointer', fontSize: T.f.sm }}>↩ Reply All</button>
            <button style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: 'transparent', color: T.textSec, border: `1px solid ${T.border}`, borderRadius: T.r.md, fontWeight: 500, cursor: 'pointer', fontSize: T.f.sm }}>↪ Forward</button>
            <div style={{ width: 1, height: 28, backgroundColor: T.border }} />
            <button onClick={() => alert('Archived!')} style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: 'transparent', color: T.textSec, border: 'none', borderRadius: T.r.md, cursor: 'pointer', fontSize: T.f.sm }}>📦 Archive</button>
            <button onClick={() => setShowSnooze(!showSnooze)} style={{ padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: showSnooze ? '#FFF7ED' : 'transparent', color: showSnooze ? PRIMARY : T.textSec, border: showSnooze ? `1px solid ${PRIMARY}` : 'none', borderRadius: T.r.md, cursor: 'pointer', fontSize: T.f.sm }}>🕐 Snooze</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: T.sp.md, paddingTop: T.sp.sm, borderTop: `1px solid ${T.border}` }}>
            <span style={{ fontSize: T.f.xs, color: T.textSec, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Prioritize</span>
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

        <CS title="AI Summary" accent="#D97706" accentBg="#FFFBEB" icon="📋" collapsed={sumCollapsed} onToggle={() => setSumCollapsed(!sumCollapsed)} preview={summaryPreview}>
          <p style={{ margin: 0, fontSize: T.f.base, color: T.text, lineHeight: 1.7, whiteSpace: 'pre-wrap' as const }}>{SAMPLE_SUMMARY}</p>
        </CS>

        <CS title="Private Notes" accent="#7C3AED" accentBg="#F5F3FF" icon="📝" collapsed={notesCollapsed} onToggle={() => setNotesCollapsed(!notesCollapsed)} preview={notesPreview}>
          <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Add a private note… only you can see this." style={{ width: '100%', minHeight: 80, padding: T.sp.sm, border: `1px solid ${T.border}`, borderRadius: T.r.sm, fontSize: T.f.base, color: T.text, resize: 'vertical', boxSizing: 'border-box' as const, fontFamily: 'inherit' }} />
        </CS>

        <CS title="Action Items" accent="#16A34A" accentBg="#F0FDF4" icon="✅" collapsed={actionsCollapsed} onToggle={() => setActionsCollapsed(!actionsCollapsed)} preview={actionsPreview}>
          <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none' }}>
            {items.map(item => (
              <li key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp.sm, padding: `${T.sp.xs} 0`, borderBottom: `1px solid ${T.border}` }}>
                <input type="checkbox" checked={item.isCompleted} onChange={e => setItems(prev => prev.map(i => i.id === item.id ? { ...i, isCompleted: e.target.checked } : i))} style={{ cursor: 'pointer', marginTop: 3, accentColor: '#16A34A' }} />
                <span style={{ flex: 1, fontSize: T.f.base, color: item.isCompleted ? T.textSec : T.text, textDecoration: item.isCompleted ? 'line-through' : 'none' }}>{item.description}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: T.sp.sm }}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="Add action item…" style={{ flex: 1, padding: `${T.sp.xs} ${T.sp.sm}`, border: `1px solid ${T.border}`, borderRadius: T.r.sm, fontSize: T.f.base, fontFamily: 'inherit' }} />
            <button onClick={addItem} style={{ padding: `${T.sp.xs} ${T.sp.md}`, backgroundColor: '#16A34A', color: '#fff', border: 'none', borderRadius: T.r.sm, cursor: 'pointer', fontSize: T.f.sm, fontWeight: 600 }}>Add</button>
          </div>
        </CS>

        <CS title="GitHub Status" accent="#1F2937" accentBg="#F9FAFB" icon="🐙" collapsed={githubCollapsed} onToggle={() => setGithubCollapsed(!githubCollapsed)} preview={githubPreview}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: T.sp.sm }}>
            {GITHUB_ITEMS.map(({ label, status, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${T.sp.xs} 0`, borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: T.f.sm, color: T.text }}>{label}</span>
                <span style={{ fontSize: T.f.xs, fontWeight: 700, color, backgroundColor: color + '18', padding: '2px 8px', borderRadius: T.r.full, flexShrink: 0 }}>{status}</span>
              </div>
            ))}
            <a href="#" onClick={e => e.preventDefault()} style={{ fontSize: T.f.sm, color: '#1F2937', fontWeight: 600, textDecoration: 'none', marginTop: T.sp.xs }}>View on GitHub →</a>
          </div>
        </CS>

        <div style={{ marginTop: T.sp.xl, paddingTop: T.sp.lg, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: T.f.sm, color: T.textSec, marginBottom: T.sp.sm }}><strong>Alice Smith</strong> · 2 hours ago</div>
          <div style={{ lineHeight: 1.7, color: T.text, fontSize: T.f.base }}>
            <p style={{ margin: '0 0 12px' }}>Hi there,</p>
            <p style={{ margin: '0 0 12px' }}>Just a quick update on the Grand Prix event. We have a few things to sort out:</p>
            <ol style={{ margin: '0 0 12px', paddingLeft: T.sp.lg }}>
              <li>Catering arrangements need to be confirmed by Thursday</li>
              <li>Finance has approved the budget, pending final sign-off</li>
              <li>We need to assign 3 team members to registration duties</li>
            </ol>
            <p style={{ margin: '0 0 12px' }}>Can you get back to me by EOD Wednesday?</p>
            <p style={{ margin: 0 }}>Best,<br />Alice</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const meta = { title: 'Email Detail/Full Panel Preview', parameters: { layout: 'padded', backgrounds: { default: 'light gray' } } };
export default meta;
type Story = StoryObj;

export const Default: Story = { render: () => <FullPanel /> };
export const AllCollapsed: Story = { name: 'All sections collapsed (with previews)', render: () => <FullPanel allCollapsed /> };
export const WithNoteAndItems: Story = { name: 'With Notes pre-filled', render: () => <FullPanel note="Follow up with Alice about the budget by Tuesday." /> };
export const HighPriority: Story = { name: 'Priority: Oh sh$t', render: () => <FullPanel priority={3} /> };
export const MediumPriority: Story = { name: 'Priority: Get on it', render: () => <FullPanel priority={2} /> };
