import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fetchFocusBearTaskSuggestions, type FocusBearTaskSuggestions } from 'queries/useFocusBear';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS, POSTHOG_NO_CAPTURE_CLASS } from 'constants/analytics-events';

import { SaveToFocusBearButton } from './SaveToFocusBearButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    i18n: { language: 'en' },
  }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const connection = { connected: true };
vi.mock('queries/useFocusBear', () => ({
  useFocusBearConnectionQuery: () => ({ data: connection }),
  fetchFocusBearTaskSuggestions: vi.fn(),
}));

const SOURCE = {
  emailSubject: 'Evaluation form for Utsav',
  sender: 'NIT Internships',
  emailUrl: 'https://app.bearlymail.com/email/e1',
};
const TITLE = 'Complete the evaluation form for Utsav';
// Friday 13 November 2026, mid-morning.
const NOW = new Date(2026, 10, 13, 10, 30);

const SUGGESTIONS: FocusBearTaskSuggestions = {
  connected: true,
  project: { id: 'p-interns', name: 'Internship program', confidence: 0.87 },
  projects: [
    { id: 'p-interns', name: 'Internship program' },
    { id: 'p-marketing', name: 'Marketing' },
  ],
  dueDate: '2026-11-17',
};

const fetchSuggestions = vi.mocked(fetchFocusBearTaskSuggestions);
const assign = vi.fn();
const originalLocation = window.location;

function renderButton() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SaveToFocusBearButton taskTitle={TITLE} source={SOURCE} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const brandmarkButton = () => screen.getByRole('button', { name: 'emailDetail.saveTaskInFocusBear' });
const saveButton = () => screen.getByRole('button', { name: 'emailDetail.saveToFocusBear' });
const savedParams = () => new URL(assign.mock.calls[0][0]).searchParams;

async function openPanel() {
  renderButton();
  fireEvent.click(brandmarkButton());
  return screen.findByRole('dialog', { name: 'emailDetail.saveTaskInFocusBear' });
}

describe('SaveToFocusBearButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    connection.connected = true;
    fetchSuggestions.mockResolvedValue(SUGGESTIONS);
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign } });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('shows the Focus Bear brandmark, not the bear emoji', () => {
    renderButton();

    expect(brandmarkButton().querySelector('svg')).not.toBeNull();
    expect(brandmarkButton()).not.toHaveTextContent('🐻');
  });

  it('says "Save task in Focus Bear" on hover and fetches the suggestions', async () => {
    renderButton();

    fireEvent.mouseEnter(brandmarkButton());

    expect(screen.getByText('emailDetail.saveTaskInFocusBear')).toBeVisible();
    await waitFor(() =>
      expect(fetchSuggestions).toHaveBeenCalledWith(expect.anything(), {
        title: TITLE,
        emailSubject: SOURCE.emailSubject,
        sender: SOURCE.sender,
      })
    );

    fireEvent.mouseLeave(brandmarkButton());

    expect(screen.queryByText('emailDetail.saveTaskInFocusBear')).toBeNull();
  });

  it('says it on keyboard focus too', () => {
    renderButton();

    fireEvent.focus(brandmarkButton());

    expect(screen.getByText('emailDetail.saveTaskInFocusBear')).toBeVisible();
  });

  it('asks before saving: a click opens the panel, defaulting to the next free spot', async () => {
    const dialog = await openPanel();

    expect(assign).not.toHaveBeenCalled();
    expect(brandmarkButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateNextFree' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateNextFree' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateCustom' })).not.toBeChecked();
    expect(dialog).toHaveClass(POSTHOG_NO_CAPTURE_CLASS);
    await waitFor(() =>
      expect(screen.getByText(/emailDetail.focusBearNextFreeHintWithDate/)).toHaveTextContent('Tue 17th Nov')
    );
  });

  it('saves "next free spot" with no due date, so Focus Bear picks the day', async () => {
    await openPanel();
    await waitFor(() => expect(screen.getByLabelText(/emailDetail.focusBearProject/)).toHaveValue('p-interns'));

    fireEvent.click(saveButton());

    expect(assign).toHaveBeenCalledTimes(1);
    expect(savedParams().has('due_date')).toBe(false);
    expect(savedParams().has('duration_minutes')).toBe(false);
    expect(savedParams().get('project_id')).toBe('p-interns');
    expect(savedParams().get('title')).toBe(TITLE);
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR,
      expect.objectContaining({ hasDueDate: false, dueDateNextFree: true, projectSuggested: true, hasDuration: false })
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reads a custom day typed snooze-style, shows it, and Enter saves it with the duration', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.click(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateCustom' }));
    const customDay = screen.getByRole('textbox', { name: 'emailDetail.focusBearCustomDueDate' });
    expect(customDay).toHaveFocus();
    await user.type(customDay, '2d');
    expect(screen.getByText(/emailDetail.focusBearDuePreviewDate/)).toHaveTextContent('Sun 15th Nov');

    const duration = screen.getByRole('textbox', { name: 'emailDetail.focusBearDuration' });
    await user.type(duration, '1h30');
    expect(screen.getByText(/emailDetail.focusBearDurationHoursMinutes/)).toHaveTextContent('"hours":1,"minutes":30');
    await user.type(duration, '{Enter}');

    expect(assign).toHaveBeenCalledTimes(1);
    expect(savedParams().get('due_date')).toBe('2026-11-15');
    expect(savedParams().get('duration_minutes')).toBe('90');
  });

  it('says "Due tomorrow" for tomorrow', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.click(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateCustom' }));
    await user.type(screen.getByRole('textbox', { name: 'emailDetail.focusBearCustomDueDate' }), 'tomorrow');

    expect(screen.getByText('emailDetail.focusBearDuePreviewTomorrow')).toBeVisible();
  });

  it('refuses a custom day it cannot read, and does not save', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.click(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateCustom' }));
    const customDay = screen.getByRole('textbox', { name: 'emailDetail.focusBearCustomDueDate' });
    await user.type(customDay, 'whenever{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('emailDetail.focusBearDueDateInvalid');
    expect(customDay).toHaveAttribute('aria-invalid', 'true');
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuses a day that has passed', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.click(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateCustom' }));
    await user.type(screen.getByRole('textbox', { name: 'emailDetail.focusBearCustomDueDate' }), 'yesterday');

    expect(screen.getByRole('alert')).toHaveTextContent('emailDetail.focusBearDueDatePast');
  });

  it('does not save Custom with nothing typed', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.click(screen.getByRole('radio', { name: 'emailDetail.focusBearDueDateCustom' }));
    fireEvent.click(saveButton());

    expect(screen.getByText('emailDetail.focusBearDueDateEmpty')).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuses a duration that is not minutes or hours', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.type(screen.getByRole('textbox', { name: 'emailDetail.focusBearDuration' }), '2d');
    fireEvent.click(saveButton());

    expect(screen.getByRole('alert')).toHaveTextContent('emailDetail.focusBearDurationInvalid');
    expect(assign).not.toHaveBeenCalled();
  });

  it('refuses a duration longer than a day', async () => {
    const user = userEvent.setup();
    await openPanel();

    await user.type(screen.getByRole('textbox', { name: 'emailDetail.focusBearDuration' }), '25h');

    expect(screen.getByRole('alert')).toHaveTextContent('emailDetail.focusBearDurationTooLong');
  });

  it('saves a changed project, no longer marked suggested', async () => {
    await openPanel();
    const project = screen.getByLabelText(/emailDetail.focusBearProject/);
    await waitFor(() => expect(project).toHaveValue('p-interns'));
    expect(screen.getByText('emailDetail.focusBearSuggested')).toBeVisible();

    fireEvent.change(project, { target: { value: 'p-marketing' } });
    fireEvent.click(saveButton());

    expect(screen.queryByText('emailDetail.focusBearSuggested')).toBeNull();
    expect(savedParams().get('project_id')).toBe('p-marketing');
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR,
      expect.objectContaining({ projectSuggested: false })
    );
  });

  it('closes on Escape and hands focus back to the brandmark', async () => {
    await openPanel();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(brandmarkButton()).toHaveFocus();
    expect(assign).not.toHaveBeenCalled();
  });

  describe('without a Focus Bear connection', () => {
    beforeEach(() => {
      connection.connected = false;
    });

    it('still asks for the due date and duration, offers a way to connect, but no project picker', async () => {
      await openPanel();

      expect(fetchSuggestions).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(/emailDetail.focusBearProject/)).toBeNull();
      expect(screen.getByText('emailDetail.focusBearNextFreeHint')).toBeVisible();
      expect(screen.getByRole('link', { name: 'emailDetail.focusBearConnectLink' })).toHaveAttribute(
        'href',
        '/settings#focus-bear'
      );

      fireEvent.click(saveButton());

      expect(savedParams().has('project_id')).toBe(false);
      expect(savedParams().has('due_date')).toBe(false);
    });
  });
});
