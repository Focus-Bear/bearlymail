import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { useFollowUpDuration } from 'hooks/useFollowUpDuration';

import { ComposeFollowUpSection } from './ComposeFollowUpSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    i18n: { language: 'en' },
  }),
}));

vi.mock('react-icons/fi', () => ({
  FiInfo: () => <svg data-testid="icon-info" />,
}));

const onSend = vi.fn();

/**
 * Mirrors how the compose page wires the section: the shared hook owns the
 * value, and Send reads whatever the hook currently reports.
 */
const Harness: React.FC = () => {
  const followUp = useFollowUpDuration();
  return (
    <>
      <ComposeFollowUpSection
        followUpDuration={followUp.followUpDuration}
        disabled={false}
        tooltipText={followUp.tooltipText}
        onChange={followUp.setFollowUpDuration}
      />
      <button onClick={() => onSend(followUp.expectedReplyDuration)}>send</button>
    </>
  );
};

const getInput = () => screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
const clickSend = () => fireEvent.click(screen.getByText('send'));

describe('ComposeFollowUpSection', () => {
  beforeEach(() => {
    onSend.mockReset();
  });

  it('renders a labelled free-text input pre-filled with the default duration', () => {
    render(<Harness />);

    const input = getInput();
    expect(input).toHaveValue('48h');
    expect(screen.getByLabelText('emailDetail.expectedReply.label')).toBe(input);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('sends the default duration when it is left untouched', () => {
    render(<Harness />);

    clickSend();

    expect(onSend).toHaveBeenCalledWith('48h');
  });

  it('sends a typed natural-language duration', () => {
    render(<Harness />);

    fireEvent.change(getInput(), { target: { value: 'next Monday' } });
    clickSend();

    expect(onSend).toHaveBeenCalledWith('next Monday');
  });

  it('sends no duration once the field is cleared', () => {
    render(<Harness />);

    fireEvent.change(getInput(), { target: { value: '' } });
    clickSend();

    expect(onSend).toHaveBeenCalledWith(undefined);
  });

  it('treats a whitespace-only value as no follow-up', () => {
    render(<Harness />);

    fireEvent.change(getInput(), { target: { value: '   ' } });
    clickSend();

    expect(onSend).toHaveBeenCalledWith(undefined);
  });

  it('clears the field from the X button', () => {
    render(<Harness />);

    fireEvent.click(screen.getByLabelText('emailDetail.expectedReply.clear'));

    expect(getInput()).toHaveValue('');
    clickSend();
    expect(onSend).toHaveBeenCalledWith(undefined);
  });

  it('disables the input while a send is in flight', () => {
    render(
      <ComposeFollowUpSection followUpDuration="48h" disabled tooltipText="tip" onChange={vi.fn()} />
    );

    expect(getInput()).toBeDisabled();
  });
});
