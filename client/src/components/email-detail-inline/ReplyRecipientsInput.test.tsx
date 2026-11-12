import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReplyRecipientsInput } from './ReplyRecipientsInput';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${String(params.recipient)}` : key),
    i18n: { language: 'en' },
  }),
}));

vi.mock('axios');

const EDIT_INPUT_LABEL = 'compose.editRecipientInputLabel';
const JULIE = 'julie@example.com';
const SCARLETT = 'Scarlett Gaffey <scarlett@example.com>';

const editButtonFor = (label: string) => screen.getByRole('button', { name: `compose.editRecipientLabel ${label}` });

const flushAnimationFrame = () => act(() => new Promise(resolve => requestAnimationFrame(() => resolve(undefined))));

// Holds the recipients like the real composer does, so a committed edit re-renders the chips.
const Harness: React.FC<{ initialTo: string; onToChange: (to: string) => void }> = ({ initialTo, onToChange }) => {
  const [to, setTo] = useState(initialTo);
  return (
    <ReplyRecipientsInput
      replyRecipients={to}
      replyCc=""
      replyBcc=""
      showCc={false}
      showBcc={false}
      onRecipientsChange={value => {
        setTo(value);
        onToChange(value);
      }}
      onCcChange={vi.fn()}
      onBccChange={vi.fn()}
      onShowCc={vi.fn()}
      onShowBcc={vi.fn()}
    />
  );
};

const renderHarness = (initialTo = `${JULIE}, ${SCARLETT}`) => {
  const onToChange = vi.fn();
  render(<Harness initialTo={initialTo} onToChange={onToChange} />);
  return { onToChange };
};

describe('ReplyRecipientsInput — editing a recipient chip', () => {
  it('turns a clicked chip into a text field pre-filled with the full address', () => {
    renderHarness();
    fireEvent.click(editButtonFor(SCARLETT));
    const editor = screen.getByLabelText(EDIT_INPUT_LABEL);
    expect(editor).toHaveValue(SCARLETT);
    expect(editor).toHaveFocus();
  });

  it('commits the edit on Enter and returns focus to the chip', async () => {
    const { onToChange } = renderHarness();
    fireEvent.click(editButtonFor(JULIE));
    const editor = screen.getByLabelText(EDIT_INPUT_LABEL);
    fireEvent.change(editor, { target: { value: 'julia@example.com' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(onToChange).toHaveBeenCalledWith(`julia@example.com, ${SCARLETT}`);
    expect(screen.queryByLabelText(EDIT_INPUT_LABEL)).not.toBeInTheDocument();
    await flushAnimationFrame();
    expect(editButtonFor('julia@example.com')).toHaveFocus();
  });

  it('commits a valid edit when the field loses focus', () => {
    const { onToChange } = renderHarness();
    fireEvent.click(editButtonFor(JULIE));
    const editor = screen.getByLabelText(EDIT_INPUT_LABEL);
    fireEvent.change(editor, { target: { value: 'Julie S <julie@example.com>' } });
    fireEvent.blur(editor);

    expect(onToChange).toHaveBeenCalledWith(`Julie S <julie@example.com>, ${SCARLETT}`);
  });

  it('cancels on Escape, keeping the original address', () => {
    const { onToChange } = renderHarness();
    fireEvent.click(editButtonFor(JULIE));
    const editor = screen.getByLabelText(EDIT_INPUT_LABEL);
    fireEvent.change(editor, { target: { value: 'someone-else@example.com' } });
    fireEvent.keyDown(editor, { key: 'Escape' });

    expect(onToChange).not.toHaveBeenCalled();
    expect(editButtonFor(JULIE)).toBeInTheDocument();
  });

  it('keeps the editor open and flags an invalid address on Enter', () => {
    const { onToChange } = renderHarness();
    fireEvent.click(editButtonFor(JULIE));
    const editor = screen.getByLabelText(EDIT_INPUT_LABEL);
    fireEvent.change(editor, { target: { value: 'julie@' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(onToChange).not.toHaveBeenCalled();
    expect(editor).toBeInTheDocument();
    expect(editor).toHaveAttribute('aria-invalid', 'true');
  });

  it('falls back to the original address when an invalid edit loses focus', () => {
    const { onToChange } = renderHarness();
    fireEvent.click(editButtonFor(JULIE));
    const editor = screen.getByLabelText(EDIT_INPUT_LABEL);
    fireEvent.change(editor, { target: { value: 'julie@' } });
    fireEvent.blur(editor);

    expect(onToChange).not.toHaveBeenCalled();
    expect(editButtonFor(JULIE)).toBeInTheDocument();
  });

  it('opens the editor from the keyboard with Enter or Space on a focused chip', async () => {
    const user = userEvent.setup();
    renderHarness();
    editButtonFor(JULIE).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText(EDIT_INPUT_LABEL)).toHaveValue(JULIE);

    await user.keyboard('{Escape}');
    await flushAnimationFrame();
    expect(editButtonFor(JULIE)).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByLabelText(EDIT_INPUT_LABEL)).toHaveValue(JULIE);
  });

  it('shows a display name without header quoting', () => {
    renderHarness('"Doe, Jane" <jane@example.com>');
    expect(editButtonFor('Doe, Jane <jane@example.com>')).toBeInTheDocument();
  });
});
