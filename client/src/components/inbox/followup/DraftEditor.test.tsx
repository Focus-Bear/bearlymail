import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DraftEditor } from './DraftEditor';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px' },
    colors: {
      primary: { main: '#000' },
      success: { main: '#0a0' },
      text: { secondary: '#666' },
      border: { light: '#e0e0e0' },
    },
    borderRadius: { sm: '4px' },
    typography: { fontSize: { sm: '14px' }, fontWeight: { medium: 500 } },
  },
}));

vi.mock('components/rich-text/RichTextEditor', () => ({
  RichTextEditor: ({ content }: { content: string }) => <div data-testid="rich-text-editor">{content}</div>,
}));

describe('DraftEditor', () => {
  const baseProps = {
    editedDraft: 'Hi Sudhir,\n\nChecking in.\n\n- J',
    isSavingDraft: false,
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders only Save and Cancel when onSaveAndSend is not provided', () => {
    render(<DraftEditor {...baseProps} />);

    expect(screen.getByText('common.save')).toBeInTheDocument();
    expect(screen.getByText('common.cancel')).toBeInTheDocument();
    expect(screen.queryByText('common.saveAndSend')).not.toBeInTheDocument();
  });

  it('renders a Save & Send button when onSaveAndSend is provided and calls it on click', () => {
    const onSaveAndSend = vi.fn();
    render(<DraftEditor {...baseProps} onSaveAndSend={onSaveAndSend} />);

    const saveAndSendButton = screen.getByText('common.saveAndSend');
    fireEvent.click(saveAndSendButton);

    expect(onSaveAndSend).toHaveBeenCalledTimes(1);
  });

  it('disables all actions while sending', () => {
    const onSaveAndSend = vi.fn();
    render(<DraftEditor {...baseProps} onSaveAndSend={onSaveAndSend} isSendingDraft />);

    expect(screen.getByText('inbox.sending')).toBeInTheDocument();
    expect(screen.getByText('inbox.sending').closest('button')).toBeDisabled();
    expect(screen.getByText('common.save').closest('button')).toBeDisabled();
    expect(screen.getByText('common.cancel').closest('button')).toBeDisabled();
  });
});
