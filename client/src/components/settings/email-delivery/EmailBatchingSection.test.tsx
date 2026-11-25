import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BatchSchedule } from 'hooks/settings/useBatchSchedule';

import { EmailBatchingSection } from './EmailBatchingSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const CALM_SCHEDULE: BatchSchedule = {
  deliveryDays: [1, 2, 3, 4, 5],
  deliveryTimes: ['11:00', '15:00'],
  timezone: 'Australia/Melbourne',
  isEnabled: true,
  urgentBypassSchedule: true,
};

const Harness: React.FC<{ onSave: (schedule: BatchSchedule) => Promise<boolean> }> = ({ onSave }) => {
  const [schedule, setSchedule] = useState(CALM_SCHEDULE);
  const [newTime, setNewTime] = useState('');
  return (
    <EmailBatchingSection
      batchSchedule={schedule}
      newDeliveryTime={newTime}
      onBatchScheduleChange={setSchedule}
      onNewDeliveryTimeChange={setNewTime}
      onSaveBatchSchedule={onSave}
    />
  );
};

describe('EmailBatchingSection', () => {
  it('has no Save button and saves a preset as soon as it is picked', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<Harness onSave={onSave} />);

    expect(screen.queryByRole('button', { name: 'common.save' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /presets.calm/ })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /presets.balanced/ }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ isEnabled: true, deliveryTimes: ['09:00', '11:00', '14:00', '16:00'] })
      )
    );
    expect(await screen.findByText('settings.autosave.saved')).toBeInTheDocument();
  });

  it('Always on saves batching off', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<Harness onSave={onSave} />);

    await userEvent.click(screen.getByRole('radio', { name: /presets.alwaysOn/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: false })));
    expect(screen.getByText('settings.delivery.summary.alwaysOn')).toBeInTheDocument();
  });

  it('keeps the days and times behind Change', async () => {
    render(<Harness onSave={vi.fn().mockResolvedValue(true)} />);

    const change = screen.getByRole('button', { name: 'settings.delivery.change' });
    expect(change).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('settings.delivery.days.label')).not.toBeVisible();

    await userEvent.click(change);

    expect(screen.getByRole('button', { name: 'settings.delivery.done' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('settings.delivery.days.label')).toBeVisible();
  });

  it('does not save a schedule with no delivery day, which would release every held email', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'settings.delivery.change' }));

    for (const day of ['mon', 'tue', 'wed', 'thu']) {
      await userEvent.click(screen.getByRole('button', { name: `settings.delivery.days.${day}` }));
    }
    expect(onSave).toHaveBeenCalledTimes(4);

    await userEvent.click(screen.getByRole('button', { name: 'settings.delivery.days.fri' }));

    expect(onSave).toHaveBeenCalledTimes(4);
    expect(screen.getByText('settings.delivery.summary.incomplete')).toBeInTheDocument();
  });

  it('says when the schedule did not save', async () => {
    render(<Harness onSave={vi.fn().mockResolvedValue(false)} />);

    await userEvent.click(screen.getByRole('radio', { name: /presets.balanced/ }));

    expect(await screen.findByText('settings.autosave.error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.autosave.retry' })).toBeInTheDocument();
  });
});
