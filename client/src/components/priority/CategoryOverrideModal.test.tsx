import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CategoryOverrideModal } from './CategoryOverrideModal';

// Capture dispatched Redux actions so we can assert the optimistic MOVE
// (updateEmail + decrement old + upsert new) rather than the old REMOVE.
const mockDispatch = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockPost = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock('queries/useCategoryContextQuery', () => ({
  useCategoryContextQuery: () => ({
    data: [{ id: 'cat-b', name: 'Personal' }],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('axios', () => ({
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

const dispatchedTypes = () => mockDispatch.mock.calls.map(call => call[0]?.type);

describe('CategoryOverrideModal – optimistic move on submit', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockInvalidateQueries.mockClear();
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: { success: true, category: 'Personal', categoryId: 'cat-b' } });
  });

  const selectPersonalAndSubmit = () => {
    // Open the combobox and pick the "Personal" category.
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.mouseDown(screen.getByText('Personal'));
    // Submit.
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
  };

  it('moves the email into the new category instead of removing it', async () => {
    render(
      <CategoryOverrideModal
        emailId="email-1"
        currentCategory="Work"
        currentCategoryId="cat-a"
        onClose={vi.fn()}
      />
    );

    selectPersonalAndSubmit();

    await waitFor(() => {
      expect(dispatchedTypes()).toContain('inboxData/updateEmail');
    });
    expect(dispatchedTypes()).toContain('inboxData/decrementCategorySummaryCount');
    expect(dispatchedTypes()).toContain('inboxData/upsertCategorySummaryCount');
    // The email must NOT be removed from the store — that was the bug (it
    // vanished from the old category and never reappeared under the new one).
    expect(dispatchedTypes()).not.toContain('inboxData/removeEmail');
  });

  it('re-groups the email under the new category id', async () => {
    render(
      <CategoryOverrideModal
        emailId="email-1"
        currentCategory="Work"
        currentCategoryId="cat-a"
        onClose={vi.fn()}
      />
    );

    selectPersonalAndSubmit();

    await waitFor(() => {
      const updateEmailAction = mockDispatch.mock.calls
        .map(call => call[0])
        .find(action => action?.type === 'inboxData/updateEmail');
      expect(updateEmailAction?.payload).toEqual({
        id: 'email-1',
        updates: { category_id: 'cat-b', category: 'Personal' },
      });
    });
  });
});
