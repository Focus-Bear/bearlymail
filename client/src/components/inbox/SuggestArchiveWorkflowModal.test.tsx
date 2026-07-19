import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import { SuggestArchiveWorkflowModal } from './SuggestArchiveWorkflowModal';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

const suggestion = { categoryId: 'cat-1', categoryName: 'Newsletters' };

describe('SuggestArchiveWorkflowModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: {} });
  });

  it('accepting creates the workflow and records acceptance', async () => {
    const onClose = vi.fn();
    render(<SuggestArchiveWorkflowModal suggestion={suggestion} onClose={onClose} />);

    await userEvent.click(screen.getByText('inbox.category.autoArchiveSuggestAccept'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(2));
    expect(mockedAxios.post.mock.calls[0][0]).toMatch(/\/workflows$/);
    expect(mockedAxios.post.mock.calls[1][1]).toEqual({ response: 'accepted' });
    expect(onClose).toHaveBeenCalled();
  });

  it('dismissing records dismissal and does not create a workflow', async () => {
    const onClose = vi.fn();
    render(<SuggestArchiveWorkflowModal suggestion={suggestion} onClose={onClose} />);

    await userEvent.click(screen.getByText('inbox.category.autoArchiveSuggestDismiss'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toMatch(/\/category-workflows\/cat-1\/suggestion-response$/);
    expect(mockedAxios.post.mock.calls[0][1]).toEqual({ response: 'dismissed' });
  });
});
