/**
 * NotificationToast Stories — Issue #1672
 *
 * Demonstrates the NotificationToast component including the new
 * SuccessWithUndo variant used for undo-able rule deletion.
 */
import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { NotificationToast } from 'components/notifications/NotificationToast';
import type { Notification } from 'contexts/NotificationContext';

const meta: Meta<typeof NotificationToast> = {
  title: 'Notifications/NotificationToast',
  component: NotificationToast,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Toast notification component. Supports success, error, warning, and info variants. ' +
          'Accepts an optional `action` prop (e.g. Undo button) for deferred-action patterns.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof NotificationToast>;

// ---------------------------------------------------------------------------
// Base variants
// ---------------------------------------------------------------------------

export const Success: Story = {
  args: {
    notification: {
      id: 'story-success',
      type: 'success',
      message: 'Rule updated successfully.',
      duration: 0, // Don't auto-dismiss in stories
    } satisfies Notification,
    onClose: () => undefined,
  },
};

export const Error: Story = {
  args: {
    notification: {
      id: 'story-error',
      type: 'error',
      message: 'Could not delete the rule. Please try again.',
      duration: 0,
    } satisfies Notification,
    onClose: () => undefined,
  },
};

export const Warning: Story = {
  args: {
    notification: {
      id: 'story-warning',
      type: 'warning',
      message: 'Your session is about to expire.',
      duration: 0,
    } satisfies Notification,
    onClose: () => undefined,
  },
};

export const Info: Story = {
  args: {
    notification: {
      id: 'story-info',
      type: 'info',
      message: 'Processing your request…',
      duration: 0,
    } satisfies Notification,
    onClose: () => undefined,
  },
};

// ---------------------------------------------------------------------------
// Undo toast (key variant for issue #1672)
// ---------------------------------------------------------------------------

export const SuccessWithUndo: Story = {
  name: 'Success with Undo (rule deletion)',
  args: {
    notification: {
      id: 'story-undo',
      type: 'success',
      message: 'Rule deleted — click Undo to restore it',
      duration: 0,
      action: {
        label: 'Undo',
        onClick: () => alert('Undo clicked — rule would be restored'),
      },
    } satisfies Notification,
    onClose: () => undefined,
  },
};

// ---------------------------------------------------------------------------
// Interactive undo demo
// ---------------------------------------------------------------------------

function UndoDemoWrapper() {
  const [log, setLog] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);

  const addLog = (msg: string) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

  if (!visible) {
    return (
      <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
        <p>Toast dismissed.</p>
        <ul>
          {log.map((entry, idx) => (
            <li key={idx}>{entry}</li>
          ))}
        </ul>
        <button
          onClick={() => {
            setVisible(true);
            setLog([]);
          }}
        >
          Reset
        </button>
      </div>
    );
  }

  const notification: Notification = {
    id: 'demo-undo',
    type: 'success',
    message: 'Rule deleted — click Undo to restore it',
    duration: 0,
    action: {
      label: 'Undo',
      onClick: () => {
        addLog('Undo clicked — deletion cancelled');
        setVisible(false);
      },
    },
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <NotificationToast
        notification={notification}
        onClose={() => {
          addLog('Toast closed (committed)');
          setVisible(false);
        }}
      />
      <ul style={{ marginTop: 120 }}>
        {log.map((entry, idx) => (
          <li key={idx}>{entry}</li>
        ))}
      </ul>
    </div>
  );
}

export const InteractiveUndoDemo: Story = {
  name: 'Interactive Undo Demo',
  render: () => <UndoDemoWrapper />,
};
