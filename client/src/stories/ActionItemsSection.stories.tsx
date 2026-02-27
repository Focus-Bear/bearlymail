import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

const T = {
  border: '#E5E7EB', text: '#111827', textSec: '#6B7280',
  sp: { xs: '4px', sm: '8px', md: '16px' },
  r: { sm: '4px', md: '8px' },
  f: { xs: '11px', sm: '13px', base: '15px' },
};
const ACCENT = '#16A34A';
const ACCENT_BG = '#F0FDF4';

interface Item { id: string; description: string; isCompleted: boolean; source: string }

const SAMPLE: Item[] = [
  { id: '1', description: 'Confirm catering arrangements by Thursday', isCompleted: false, source: 'llm' },
  { id: '2', description: 'Get final sign-off from finance team', isCompleted: true, source: 'llm' },
  { id: '3', description: 'Assign three team members to registration duties', isCompleted: false, source: 'user' },
  { id: '4', description: 'Send calendar invites to all attendees', isCompleted: false, source: 'llm' },
];

interface ActionsProps { initialItems?: Item[]; loading?: boolean }

const ActionsSection = ({ initialItems = [], loading = false }: ActionsProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [newItem, setNewItem] = useState('');

  const toggle = (id: string, done: boolean) => setItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted: done } : i));
  const del = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const add = () => {
    if (!newItem.trim()) return;
    setItems(prev => [...prev, { id: `item-${Date.now()}`, description: newItem, isCompleted: false, source: 'user' }]);
    setNewItem('');
  };

  const done = items.filter(i => i.isCompleted).length;

  return (
    <div style={{ maxWidth: 640, borderRadius: T.r.md, border: `1px solid ${T.border}`, overflow: 'hidden', marginBottom: T.sp.md }}>
      <button onClick={() => setCollapsed(!collapsed)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: T.sp.sm, padding: `${T.sp.sm} ${T.sp.md}`, backgroundColor: ACCENT_BG, border: 'none', borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer', textAlign: 'left' as const }}>
        <span style={{ fontSize: '16px' }}>✅</span>
        <span style={{ flex: 1, fontSize: T.f.sm, fontWeight: 600, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Action Items</span>
        {items.length > 0 && <span style={{ fontSize: T.f.xs, color: T.textSec }}>{done}/{items.length} done</span>}
        <span style={{ fontSize: T.f.xs, color: T.textSec, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </button>
      {!collapsed && (
        <div style={{ padding: T.sp.md, backgroundColor: '#FFFFFF' }}>
          {loading ? (
            <div style={{ color: T.textSec, fontSize: T.f.sm }}>⏳ Extracting action items…</div>
          ) : items.length === 0 ? (
            <div style={{ color: T.textSec, fontSize: T.f.sm, marginBottom: T.sp.md }}>No action items yet. <button onClick={() => alert('Extract!')} style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontWeight: 600, fontSize: T.f.sm }}>Extract from email →</button></div>
          ) : (
            <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none' }}>
              {items.map(item => (
                <li key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp.sm, padding: `${T.sp.xs} 0`, borderBottom: `1px solid ${T.border}` }}>
                  <input type="checkbox" checked={item.isCompleted} onChange={e => toggle(item.id, e.target.checked)} style={{ cursor: 'pointer', marginTop: 3, accentColor: ACCENT }} />
                  <span style={{ flex: 1, fontSize: T.f.base, color: item.isCompleted ? T.textSec : T.text, textDecoration: item.isCompleted ? 'line-through' : 'none', lineHeight: 1.5 }}>{item.description}</span>
                  <span style={{ fontSize: T.f.xs, color: item.source === 'llm' ? '#7C3AED' : T.textSec, flexShrink: 0 }}>{item.source === 'llm' ? '🤖' : '👤'}</span>
                  <button onClick={() => del(item.id)} style={{ background: 'none', border: 'none', color: T.textSec, cursor: 'pointer', padding: 0, fontSize: 14, flexShrink: 0 }}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: T.sp.sm }}>
            <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add action item…" style={{ flex: 1, padding: `${T.sp.xs} ${T.sp.sm}`, border: `1px solid ${T.border}`, borderRadius: T.r.sm, fontSize: T.f.base, color: T.text, fontFamily: 'inherit' }} />
            <button onClick={add} style={{ padding: `${T.sp.xs} ${T.sp.md}`, backgroundColor: ACCENT, color: '#fff', border: 'none', borderRadius: T.r.sm, cursor: 'pointer', fontSize: T.f.sm, fontWeight: 600 }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
};

const meta = { title: 'Email Detail/ActionItemsSection', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const Empty: Story = { render: () => <ActionsSection /> };
export const WithItems: Story = { render: () => <ActionsSection initialItems={SAMPLE} /> };
export const AllCompleted: Story = { render: () => <ActionsSection initialItems={SAMPLE.map(i => ({ ...i, isCompleted: true }))} /> };
export const Extracting: Story = { render: () => <ActionsSection loading /> };
