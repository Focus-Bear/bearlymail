/**
 * The Ask AI approval card: it must show the tool, the connected server and
 * the full arguments that will run, and report Approve / Deny accurately.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { AskAiToolApprovalCard } from 'components/inbox/AskAiToolApprovalCard';
import type { AskAiPendingToolCall } from 'hooks/useAskAi';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => (vars ? `${key} ${JSON.stringify(vars)}` : key),
    i18n: { language: 'en' },
  }),
}));

const PENDING: AskAiPendingToolCall = {
  approvalId: 'approval-1',
  serverName: 'Google Drive',
  toolName: 'share_file',
  toolTitle: 'Share file',
  arguments: { fileId: 'deck-123', email: 'sam@example.com', role: 'writer' },
  argumentsHash: 'a'.repeat(64),
  expiresAt: '2026-11-13T10:00:00.000Z',
};

describe('AskAiToolApprovalCard', () => {
  it('shows the tool, the server and every argument', () => {
    render(<AskAiToolApprovalCard pendingToolCall={PENDING} onDecide={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'inbox.askAi.approval.title' })).toBeInTheDocument();
    const description = screen.getByText(/inbox\.askAi\.approval\.description/);
    expect(description.textContent).toContain('Share file (share_file)');
    expect(description.textContent).toContain('Google Drive');

    const args = screen.getByTestId('ask-ai-tool-approval-arguments');
    expect(JSON.parse(args.textContent ?? '')).toEqual(PENDING.arguments);
  });

  it('moves focus to the card so keyboard users find it', () => {
    render(<AskAiToolApprovalCard pendingToolCall={PENDING} onDecide={vi.fn()} />);
    expect(screen.getByTestId('ask-ai-tool-approval')).toHaveFocus();
  });

  it('reports approve and deny', () => {
    const onDecide = vi.fn();
    render(<AskAiToolApprovalCard pendingToolCall={PENDING} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: 'inbox.askAi.approval.approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'inbox.askAi.approval.deny' }));

    expect(onDecide).toHaveBeenNthCalledWith(1, true);
    expect(onDecide).toHaveBeenNthCalledWith(2, false);
  });

  it('says when the action sends no details', () => {
    render(<AskAiToolApprovalCard pendingToolCall={{ ...PENDING, arguments: {} }} onDecide={vi.fn()} />);
    expect(screen.getByText('inbox.askAi.approval.noArguments')).toBeInTheDocument();
    expect(screen.queryByTestId('ask-ai-tool-approval-arguments')).not.toBeInTheDocument();
  });

  it('disables both buttons while a decision is being sent', () => {
    render(<AskAiToolApprovalCard pendingToolCall={PENDING} onDecide={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'inbox.askAi.approval.approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'inbox.askAi.approval.deny' })).toBeDisabled();
  });
});
