import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

import { AddCategoryWorkflowModal } from './AddCategoryWorkflowModal';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showSuccess, showError }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

describe('AddCategoryWorkflowModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.post.mockResolvedValue({ data: {} });
  });

  it('creates a category-scoped archive workflow and records acceptance', async () => {
    const onClose = vi.fn();
    render(<AddCategoryWorkflowModal categoryId="cat-1" categoryName="Newsletters" onClose={onClose} />);

    await userEvent.click(screen.getByText('settings.categoryWorkflows.createButton'));

    await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledTimes(2));

    // 1) creates the workflow scoped to the category, with an archive action
    const [workflowUrl, workflowBody] = mockedAxios.post.mock.calls[0];
    expect(workflowUrl).toMatch(/\/workflows$/);
    expect(workflowBody).toMatchObject({
      enabled: true,
      condition: expect.objectContaining({ categories: ['cat-1'] }),
      actions: [{ type: 'archive', label: '' }],
    });

    // 2) records the suggestion as accepted so we don't re-nag
    const [responseUrl, responseBody] = mockedAxios.post.mock.calls[1];
    expect(responseUrl).toMatch(/\/category-workflows\/cat-1\/suggestion-response$/);
    expect(responseBody).toEqual({ response: 'accepted' });

    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error and stays open when creation fails', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('boom'));
    const onClose = vi.fn();
    render(<AddCategoryWorkflowModal categoryId="cat-1" categoryName="Newsletters" onClose={onClose} />);

    await userEvent.click(screen.getByText('settings.categoryWorkflows.createButton'));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
