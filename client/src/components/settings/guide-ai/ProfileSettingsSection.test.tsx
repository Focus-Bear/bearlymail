import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ProfileSettingsSection } from './ProfileSettingsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const SAVE_WAIT = { timeout: 3000 };

/** Like the Settings page: a save writes the new values back into the props. */
const Harness: React.FC<{ onSave: (fields: Record<string, string>) => Promise<void> }> = ({ onSave }) => {
  const [saved, setSaved] = useState({ displayName: 'Dan', jobTitle: '', calendarBookingUrl: '' });
  return (
    <ProfileSettingsSection
      {...saved}
      onUpdate={async fields => {
        await onSave(fields as Record<string, string>);
        setSaved(previous => ({ ...previous, ...fields }));
      }}
    />
  );
};

describe('ProfileSettingsSection', () => {
  it('shows editable fields with no Edit or Save button', () => {
    render(<Harness onSave={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByLabelText('settings.profile.displayNameLabel')).toHaveValue('Dan');
    expect(screen.queryByRole('button', { name: 'common.edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.save' })).not.toBeInTheDocument();
  });

  it('saves a moment after typing stops and shows Saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSave={onSave} />);

    await userEvent.type(screen.getByLabelText('settings.profile.jobTitleLabel'), 'Developer');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), SAVE_WAIT);
    expect(onSave).toHaveBeenCalledWith({ displayName: 'Dan', jobTitle: 'Developer', calendarBookingUrl: '' });
    expect(await screen.findByText('settings.autosave.saved')).toBeInTheDocument();
  });

  it('does not lose typing that happens while a save is still on its way', async () => {
    let finishFirstSave: () => void = () => undefined;
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>(resolve => (finishFirstSave = resolve)))
      .mockResolvedValue(undefined);
    render(<Harness onSave={onSave} />);
    const name = screen.getByLabelText('settings.profile.displayNameLabel');

    await userEvent.type(name, 'iel');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), SAVE_WAIT);
    await userEvent.type(name, ' A');
    finishFirstSave();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2), SAVE_WAIT);
    expect(name).toHaveValue('Daniel A');
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ displayName: 'Daniel A' }));
  });
});
