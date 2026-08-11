import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Attendee } from 'utils/attendeeUtils';

import { AttendeePicker } from 'components/quick-actions/AttendeePicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const CANDIDATES: Attendee[] = [
  { name: 'Sender', email: 'sender@example.com' },
  { name: 'Colleague', email: 'colleague@example.com' },
  { name: 'cc-person@example.com', email: 'cc-person@example.com' },
];

/** Controlled test harness that mirrors how the picker is used in the invite forms. */
const Harness: React.FC<{ candidates?: Attendee[]; onChange?: (emails: string[]) => void }> = ({
  candidates = CANDIDATES,
  onChange,
}) => {
  const [selected, setSelected] = useState<string[]>(candidates.map((attendee) => attendee.email));
  return (
    <>
      <AttendeePicker
        candidates={candidates}
        selectedEmails={selected}
        onChange={(emails) => {
          setSelected(emails);
          onChange?.(emails);
        }}
      />
      <div data-testid="selected">{selected.join(',')}</div>
    </>
  );
};

const selectedValue = () => screen.getByTestId('selected').textContent;

describe('AttendeePicker', () => {
  it('renders a checkbox per candidate, all pre-selected', () => {
    render(<Harness />);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);
    expect(selectedValue()).toBe('sender@example.com,colleague@example.com,cc-person@example.com');
  });

  it('unchecking a candidate removes it from the selection', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('colleague@example.com'));
    expect(selectedValue()).toBe('sender@example.com,cc-person@example.com');
  });

  it('adds a free-text email to the selection', () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('attendeePicker.addPlaceholder'), {
      target: { value: 'Extra Person <extra@example.com>' },
    });
    fireEvent.click(screen.getByText('attendeePicker.add'));
    expect(selectedValue()).toContain('extra@example.com');
    expect(screen.getByLabelText('extra@example.com')).toBeInTheDocument();
  });

  it('rejects an invalid free-text email with an error and no selection change', () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('attendeePicker.addPlaceholder'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByText('attendeePicker.add'));
    expect(screen.getByText('attendeePicker.invalidEmail')).toBeInTheDocument();
    expect(selectedValue()).toBe('sender@example.com,colleague@example.com,cc-person@example.com');
  });
});
