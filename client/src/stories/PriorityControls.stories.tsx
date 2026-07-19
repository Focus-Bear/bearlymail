/**
 * Visual stories for the redesigned priority controls (PR #2535):
 *  - PriorityInlineSelector — the slim one-tap pill row used in the inbox list.
 *  - PriorityChip — the open-email dropdown chip (closed + menu-open states).
 *
 * Uses the real components with a scoped i18n instance so screenshots reflect production styling.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { FiArchive } from 'react-icons/fi';

import { PriorityChip } from 'components/priority/PriorityChip';
import { PriorityInlineSelector } from 'components/priority/PriorityInlineSelector';

import { priorityControlsI18n } from './storyHelpers/i18nInstances';

const ghostAction: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: '#666',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
};

/** Snooze / Archive / overflow (⋮ holds Block sender / Unsubscribe) — ghost actions at the row's right edge. */
const actionsGroup = (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, marginLeft: 'auto', height: 36 }}>
    <button style={ghostAction}>🕐 Snooze</button>
    <button style={ghostAction}>
      <FiArchive size={15} /> Archive
    </button>
    <button style={{ ...ghostAction, fontSize: 18 }} aria-label="More options">
      ⋮
    </button>
  </div>
);

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: '#fff',
  color: '#444',
  fontSize: 14,
  cursor: 'pointer',
};

const meta = {
  title: 'Priority/PriorityControls',
  parameters: { layout: 'padded' },
};
export default meta;

const Card: React.FC<{ title: string; width?: number; children: React.ReactNode }> = ({
  title,
  width = 520,
  children,
}) => (
  <I18nextProvider i18n={priorityControlsI18n}>
    <div style={{ maxWidth: width }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', marginBottom: 10 }}>{title}</div>
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #ECECEC',
          borderRadius: 12,
          padding: 16,
        }}
      >
        {children}
      </div>
    </div>
  </I18nextProvider>
);

const Stateful: React.FC<{ initial: number; render: (n: number, set: (v: number) => void) => React.ReactNode }> = ({
  initial,
  render,
}) => {
  const [count, setCount] = useState(initial);
  return <>{render(count, setCount)}</>;
};

export const InboxListSelector = {
  name: 'Inbox list — slim inline selector',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <Card title="IN THE INBOX LIST · not prioritized" width={760}>
        <Stateful
          initial={0}
          render={(count, set) => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  flex: '0 1 auto',
                  background: '#fff',
                  border: '1px solid #ececec',
                  borderRadius: 8,
                  padding: '4px 12px',
                }}
              >
                <PriorityInlineSelector starCount={count} inlineLabel onSelect={newCount => set(newCount)} />
              </div>
              {actionsGroup}
            </div>
          )}
        />
      </Card>
      <Card title="IN THE INBOX LIST · “Get on it” selected" width={760}>
        <Stateful
          initial={2}
          render={(count, set) => (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  flex: '0 1 auto',
                  background: '#fff',
                  border: '1px solid #ececec',
                  borderRadius: 8,
                  padding: '4px 12px',
                }}
              >
                <PriorityInlineSelector starCount={count} inlineLabel onSelect={newCount => set(newCount)} />
              </div>
              {actionsGroup}
            </div>
          )}
        />
      </Card>
    </div>
  ),
};

export const OpenEmailChipInToolbar = {
  name: 'Open email — chip in toolbar',
  render: () => (
    <Card title="IN THE OPEN EMAIL · chip inline in the action toolbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button style={{ ...toolbarBtn, background: '#1f2933', color: '#fff', border: '1px solid #1f2933' }}>
          ↩ Reply All
        </button>
        <button style={toolbarBtn}>↪ Forward</button>
        <span style={{ width: 1, height: 24, background: '#e5e5e5' }} />
        <button style={toolbarBtn}>📥 Archive</button>
        <button style={toolbarBtn}>🕐 Snooze</button>
        <div style={{ marginLeft: 'auto' }}>
          <Stateful initial={3} render={(count, set) => <PriorityChip inlineLabel starCount={count} onSelect={set} />} />
        </div>
      </div>
    </Card>
  ),
};

export const OpenEmailChipClosed = {
  name: 'Open email — chip (closed)',
  render: () => (
    <Card title="IN THE OPEN EMAIL · toolbar chip">
      <Stateful initial={2} render={(count, set) => <PriorityChip starCount={count} onSelect={newCount => set(newCount)} />} />
    </Card>
  ),
};

export const OpenEmailChipOpen = {
  name: 'Open email — chip menu open',
  render: () => (
    <div style={{ minHeight: 320 }}>
      <Card title="IN THE OPEN EMAIL · menu open (click the chip)">
        <Stateful initial={2} render={(count, set) => <PriorityChip starCount={count} onSelect={newCount => set(newCount)} />} />
      </Card>
    </div>
  ),
};
