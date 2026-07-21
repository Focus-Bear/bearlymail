import React, { useState } from 'react';
import type { StoryObj } from '@storybook/react';

/**
 * Visual mockup of the thread view's new per-message reply/forward actions.
 * Reproduces EmailThreadView's expanded-message layout (orange header, From/To
 * block, body) plus the Reply / Reply All / Forward buttons now rendered on each
 * message so the user can act on an earlier message, not only the newest one.
 */

const Th = {
  primary: '#E9902C',
  primarySubtle: '#FEF6EC',
  primaryLight: '#F0A859',
  border: '#EFEFEF',
  paper: '#FFFFFF',
  subtle: '#FAFAFA',
  text: '#1A1A1A',
  textSec: '#666666',
  sp: { xs: '4px', sm: '8px', md: '12px', lg: '16px' },
  r: { md: '6px', lg: '10px' },
  f: { sm: '13px', base: '15px', lg: '17px' },
};

interface ThreadMsg {
  id: string;
  fromName: string;
  from: string;
  to: string;
  cc?: string;
  timeAgo: string;
  body: string;
  isCurrent: boolean;
  expanded: boolean;
}

const MESSAGES: ThreadMsg[] = [
  {
    id: '1',
    fromName: 'Alex Morgan',
    from: 'alex@example.com',
    to: 'Jamie Chen, Sam Rivers, jeremy@focusbear.io, Taylor Brooks',
    timeAgo: '21 hours ago',
    body: 'Hello all,\n\nThank you for accepting our invitation to join the APAC 2027 Lived Experience Advisory Group. I know that this is all happening fast, and please engage only how you are comfortable doing so.',
    isCurrent: false,
    expanded: true,
  },
  {
    id: '2',
    fromName: 'Sam Rivers',
    from: 'sam@example.com',
    to: 'Alex Morgan, Jamie Chen, jeremy@focusbear.io, Taylor Brooks',
    timeAgo: '14 hours ago',
    body: 'Wonderful to be included — count me in. Happy to contribute ideas over email if I can’t make a meeting.',
    isCurrent: false,
    expanded: false,
  },
  {
    id: '3',
    fromName: 'Taylor Brooks (DPC)',
    from: 'taylor@example.com',
    to: 'Alex Morgan, Jamie Chen, Sam Rivers, jeremy@focusbear.io',
    timeAgo: '2 hours ago',
    body: 'Thanks Niki. Looking forward to it.',
    isCurrent: true,
    expanded: false,
  },
];

const ReplyActions = () => {
  const btn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: Th.sp.xs,
    padding: `${Th.sp.xs} ${Th.sp.sm}`,
    fontSize: Th.f.sm,
    fontWeight: 500,
    color: Th.primary,
    backgroundColor: 'transparent',
    border: `1px solid ${Th.border}`,
    borderRadius: Th.r.md,
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: Th.sp.sm, marginTop: Th.sp.lg }}>
      <button style={btn}>
        <span aria-hidden>↩</span> Reply
      </button>
      <button style={btn}>
        <span aria-hidden>↩↩</span> Reply All
      </button>
      <button style={btn}>
        <span aria-hidden>➔</span> Forward
      </button>
    </div>
  );
};

const AddressLine = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', gap: Th.sp.xs, wordBreak: 'break-word' }}>
    <span style={{ fontWeight: 600, flexShrink: 0 }}>{label}:</span>
    <span>{value}</span>
  </div>
);

const ThreadMessage = ({ msg }: { msg: ThreadMsg }) => {
  const [expanded, setExpanded] = useState(msg.expanded);
  return (
    <div
      style={{
        marginBottom: Th.sp.lg,
        border: msg.isCurrent ? `2px solid ${Th.primary}` : `1px solid ${Th.border}`,
        borderRadius: Th.r.lg,
        overflow: 'hidden',
        backgroundColor: msg.isCurrent ? Th.primarySubtle : Th.paper,
      }}
    >
      <div
        onClick={() => setExpanded(prev => !prev)}
        style={{
          padding: Th.sp.md,
          cursor: 'pointer',
          backgroundColor: msg.isCurrent ? Th.primaryLight : Th.subtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: Th.text, marginBottom: Th.sp.xs }}>{msg.fromName}</div>
          <div style={{ fontSize: Th.f.sm, color: Th.text, opacity: 0.8 }}>{msg.timeAgo}</div>
        </div>
        <div
          style={{
            fontSize: Th.f.sm,
            color: Th.textSec,
            padding: `${Th.sp.xs} ${Th.sp.sm}`,
            backgroundColor: Th.paper,
            borderRadius: Th.r.md,
          }}
        >
          {expanded ? '▼' : '▶'}
        </div>
      </div>

      {expanded ? (
        <div style={{ padding: Th.sp.lg, color: Th.text, lineHeight: 1.8, fontSize: Th.f.lg }}>
          <div
            style={{
              marginBottom: Th.sp.md,
              paddingBottom: Th.sp.md,
              borderBottom: `1px solid ${Th.border}`,
              fontSize: Th.f.sm,
              color: Th.textSec,
              lineHeight: 1.6,
            }}
          >
            <AddressLine label="From" value={`${msg.fromName} <${msg.from}>`} />
            <AddressLine label="To" value={msg.to} />
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</div>
          <ReplyActions />
        </div>
      ) : (
        <div
          onClick={() => setExpanded(true)}
          style={{
            padding: Th.sp.md,
            color: Th.textSec,
            fontSize: Th.f.base,
            fontStyle: 'italic',
            cursor: 'pointer',
          }}
        >
          {msg.body.substring(0, 90)}...
        </div>
      )}
    </div>
  );
};

const ThreadView = () => (
  <div style={{ maxWidth: 760 }}>
    <h3 style={{ fontSize: Th.f.lg, fontWeight: 600, color: Th.text, marginBottom: Th.sp.lg }}>
      💬 Thread (3 messages)
    </h3>
    {MESSAGES.map(msg => (
      <ThreadMessage key={msg.id} msg={msg} />
    ))}
  </div>
);

const meta = { title: 'Email Detail/Thread View', parameters: { layout: 'padded' } };
export default meta;
type Story = StoryObj;

export const PerMessageReplyActions: Story = {
  name: 'Per-message reply / forward',
  render: () => <ThreadView />,
};
