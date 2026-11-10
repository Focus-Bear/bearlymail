import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchFocusBearTaskSuggestions, type FocusBearTaskSuggestions } from 'queries/useFocusBear';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { SaveToFocusBearLink } from './SaveToFocusBearLink';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
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

const SUGGESTIONS: FocusBearTaskSuggestions = {
  connected: true,
  project: { id: 'p-interns', name: 'Internship program', confidence: 0.87 },
  projects: [
    { id: 'p-interns', name: 'Internship program' },
    { id: 'p-marketing', name: 'Marketing' },
  ],
  dueDate: '2026-11-12',
};

const fetchSuggestions = vi.mocked(fetchFocusBearTaskSuggestions);

function renderLink() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SaveToFocusBearLink taskTitle={TITLE} source={SOURCE} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const quickSaveLink = () => screen.getByRole('link', { name: 'emailDetail.saveToFocusBear' });
const paramsOf = (element: HTMLElement) => new URL(element.getAttribute('href') ?? '').searchParams;

describe('SaveToFocusBearLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.connected = true;
    fetchSuggestions.mockResolvedValue(SUGGESTIONS);
  });

  it('fetches the suggestions on hover and puts them in the quick-save link', async () => {
    renderLink();

    fireEvent.mouseEnter(quickSaveLink());

    await waitFor(() => expect(paramsOf(quickSaveLink()).get('project_id')).toBe('p-interns'));
    expect(paramsOf(quickSaveLink()).get('due_date')).toBe('2026-11-12');
    expect(fetchSuggestions).toHaveBeenCalledWith(expect.anything(), {
      title: TITLE,
      emailSubject: SOURCE.emailSubject,
      sender: SOURCE.sender,
    });
  });

  it('waits for the suggestions when the 🐻 is clicked before they arrive, then saves with them', async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, assign } });
    try {
      renderLink();

      const notPrevented = fireEvent.click(quickSaveLink());

      expect(notPrevented).toBe(false);
      await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
      const saved = new URL(assign.mock.calls[0][0]).searchParams;
      expect(saved.get('project_id')).toBe('p-interns');
      expect(saved.get('due_date')).toBe('2026-11-12');
      expect(captureEvent).toHaveBeenCalledWith(
        ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR,
        expect.objectContaining({ fromPanel: false, projectSuggested: true, dueDateSuggested: true })
      );
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('shows the suggestions in the panel, marked suggested, until the user changes them', async () => {
    renderLink();

    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.focusBearSaveOptions' }));

    const project = await screen.findByLabelText(/emailDetail.focusBearProject/);
    await waitFor(() => expect(project).toHaveValue('p-interns'));
    expect(screen.getByLabelText(/emailDetail.focusBearDueDate/)).toHaveValue('2026-11-12');
    expect(screen.getAllByText('emailDetail.focusBearSuggested')).toHaveLength(2);

    fireEvent.change(project, { target: { value: 'p-marketing' } });

    expect(screen.getAllByText('emailDetail.focusBearSuggested')).toHaveLength(1);
    const save = screen.getByRole('link', { name: 'emailDetail.focusBearSave' });
    expect(paramsOf(save).get('project_id')).toBe('p-marketing');
    expect(paramsOf(save).get('due_date')).toBe('2026-11-12');

    fireEvent.click(save);

    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.ACTION_ITEM_SAVED_TO_FOCUS_BEAR,
      expect.objectContaining({ fromPanel: true, projectSuggested: false, dueDateSuggested: true })
    );
  });

  it('saves with no project and no date when Focus Bear has no suggestion', async () => {
    fetchSuggestions.mockResolvedValue({ ...SUGGESTIONS, project: null, dueDate: null });
    renderLink();

    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.focusBearSaveOptions' }));

    const project = await screen.findByLabelText(/emailDetail.focusBearProject/);
    await act(async () => {});
    expect(project).toHaveValue('');
    expect(screen.queryByText('emailDetail.focusBearSuggested')).toBeNull();
    const save = screen.getByRole('link', { name: 'emailDetail.focusBearSave' });
    expect(paramsOf(save).has('project_id')).toBe(false);
    expect(paramsOf(save).has('due_date')).toBe(false);
  });

  describe('without a Focus Bear connection', () => {
    beforeEach(() => {
      connection.connected = false;
    });

    it('saves at once without asking for suggestions', () => {
      renderLink();

      fireEvent.mouseEnter(quickSaveLink());
      const notPrevented = fireEvent.click(quickSaveLink());

      expect(notPrevented).toBe(true);
      expect(fetchSuggestions).not.toHaveBeenCalled();
      expect(paramsOf(quickSaveLink()).has('project_id')).toBe(false);
    });

    it('offers a due date and a way to connect, but no project picker', () => {
      renderLink();

      fireEvent.click(screen.getByRole('button', { name: 'emailDetail.focusBearSaveOptions' }));

      expect(screen.queryByLabelText(/emailDetail.focusBearProject/)).toBeNull();
      expect(screen.getByLabelText(/emailDetail.focusBearDueDate/)).toHaveValue('');
      expect(screen.getByRole('link', { name: 'emailDetail.focusBearConnectLink' })).toHaveAttribute(
        'href',
        '/settings#focus-bear'
      );
    });
  });

  it('closes the panel on Escape', () => {
    renderLink();
    fireEvent.click(screen.getByRole('button', { name: 'emailDetail.focusBearSaveOptions' }));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
