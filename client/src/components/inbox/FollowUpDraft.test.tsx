import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FollowUpDraft } from './FollowUpDraft';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px' },
    colors: {
      primary: { main: '#000' },
      success: { main: '#0a0' },
      error: { main: '#f00' },
      text: { secondary: '#666' },
      border: { light: '#e0e0e0' },
      background: { subtle: '#f5f5f5', paper: '#fff' },
    },
    borderRadius: { sm: '4px', md: '4px' },
    typography: { fontSize: { xs: '12px', sm: '14px' }, fontWeight: { medium: 500 } },
  },
}));

vi.mock('components/rich-text/RichTextEditor', () => ({
  RichTextEditor: ({ content, onChange }: { content: string; onChange: (value: string) => void }) => (
    <textarea data-testid="rich-text-editor" value={content} onChange={event => onChange(event.target.value)} />
  ),
}));

describe('FollowUpDraft', () => {
  const followUpData = {
    id: 'followup-1',
    draftFollowUp: 'Hi Team,\n\nChecking in.\n\n- J',
    generationStatus: 'completed' as const,
    generationError: null,
    sendStatus: null,
    sendError: null,
  };

  it('persists the edited draft and then sends it when Save & Send is clicked', async () => {
    const onUpdateDraft = vi.fn().mockResolvedValue(undefined);
    const onSendFollowUp = vi.fn().mockResolvedValue(undefined);

    render(
      <FollowUpDraft followUpData={followUpData} onUpdateDraft={onUpdateDraft} onSendFollowUp={onSendFollowUp} />
    );

    fireEvent.click(screen.getByText('common.edit'));

    const textarea = screen.getByTestId('rich-text-editor');
    fireEvent.change(textarea, { target: { value: 'Hi Sudhir,\n\nChecking in.\n\n- J' } });

    fireEvent.click(screen.getByText('common.saveAndSend'));

    await waitFor(() => {
      expect(onUpdateDraft).toHaveBeenCalledWith('followup-1', 'Hi Sudhir,\n\nChecking in.\n\n- J');
      expect(onSendFollowUp).toHaveBeenCalledWith('followup-1', 'Hi Sudhir,\n\nChecking in.\n\n- J');
    });

    // Should exit edit mode back to the display view.
    await waitFor(() => {
      expect(screen.queryByTestId('rich-text-editor')).not.toBeInTheDocument();
    });
  });

  it('does not offer Save & Send when onSendFollowUp is not provided', () => {
    render(<FollowUpDraft followUpData={followUpData} onUpdateDraft={vi.fn()} />);

    fireEvent.click(screen.getByText('common.edit'));

    expect(screen.queryByText('common.saveAndSend')).not.toBeInTheDocument();
  });
});
