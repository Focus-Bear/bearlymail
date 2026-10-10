import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AccountDeletionSection } from './AccountDeletionSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const logout = vi.fn();
vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ logout }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const deleteMock = vi.fn();
vi.mock('axios', () => ({ default: { delete: (...args: unknown[]) => deleteMock(...args) } }));

const CONFIRMATION_TEXT = 'delete all my data';
const DELETE_BUTTON = 'settings.accountDeletion.deleteButton';
const CONFIRM_DELETE = 'settings.accountDeletion.confirmDelete';
const DELETING = 'settings.accountDeletion.deleting';
const CANCEL = 'common.cancel';

describe('AccountDeletionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A deletion request that never settles, so the component stays in the
    // in-flight loading state for the assertions below.
    deleteMock.mockReturnValue(new Promise(() => {}));
  });

  it('shows Cancel and the delete button before the request starts', () => {
    render(<AccountDeletionSection />);
    fireEvent.click(screen.getByText(DELETE_BUTTON));

    expect(screen.getByText(CONFIRM_DELETE)).toBeInTheDocument();
    expect(screen.getByText(CANCEL)).toBeInTheDocument();
    expect(screen.queryByText(DELETING)).not.toBeInTheDocument();
  });

  it('shows only the Deleting state while the request is in flight, not the delete or cancel buttons', async () => {
    render(<AccountDeletionSection />);

    fireEvent.click(screen.getByText(DELETE_BUTTON));
    fireEvent.change(screen.getByPlaceholderText(CONFIRMATION_TEXT), {
      target: { value: CONFIRMATION_TEXT },
    });
    fireEvent.click(screen.getByText(CONFIRM_DELETE));

    await waitFor(() => expect(screen.getByText(DELETING)).toBeInTheDocument());
    // The reported bug: both the loading state and the delete button visible at
    // once. Neither the delete button nor Cancel may remain while deleting.
    expect(screen.queryByText(CONFIRM_DELETE)).not.toBeInTheDocument();
    expect(screen.queryByText(CANCEL)).not.toBeInTheDocument();
  });
});
