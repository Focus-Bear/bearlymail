import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Deals from './Deals';

// The bug: after editing a deal and saving, handleUpdateDeal cleared editingDeal
// but never closed the modal (no setShowDealForm(false)). The modal stayed open
// AND flipped to "create" mode (editingDeal now null), so a second Save created a
// duplicate. These tests assert the modal closes and only an update (PUT) fires.

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    put: (...args: unknown[]) => mockPut(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'me@example.com' }, logout: vi.fn() }),
}));

vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

vi.mock('hooks/useSidebarState', () => ({
  useSidebarState: () => ({
    isCollapsed: false,
    canToggleCollapse: true,
    isMobileMenuOpen: false,
    toggleCollapse: vi.fn(),
    openMobileMenu: vi.fn(),
    closeMobileMenu: vi.fn(),
  }),
}));

vi.mock('components/inbox/Sidebar', () => ({ Sidebar: () => null }));

// Stub the modal so the test drives the parent's save/close wiring (the bug),
// not the modal's internal form. Its "Save" button fires onSave like a real save.
vi.mock('components/crm/DealFormModal', () => ({
  DealFormModal: ({
    onSave,
  }: {
    onSave: (payload: { title: string }) => void;
    onClose: () => void;
  }) => (
    <div data-testid="deal-form-modal">
      <button type="button" onClick={() => onSave({ title: 'Deal 1 (edited)' })}>
        stub-save
      </button>
    </div>
  ),
}));

const kanban = {
  stages: [{ id: 's1', name: 'Lead' }],
  deals: {
    s1: [
      {
        id: 'd1',
        title: 'Deal 1',
        details: null,
        value: null,
        currency: 'USD',
        stageId: 's1',
        stageName: 'Lead',
        contactId: null,
        contactName: null,
        contactEmail: null,
        expectedCloseDate: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ],
  },
  totals: { s1: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) =>
    url.includes('/deals/kanban')
      ? Promise.resolve({ data: kanban })
      : Promise.resolve({ data: [] })
  );
  mockPut.mockResolvedValue({ data: {} });
  mockPost.mockResolvedValue({ data: {} });
});

describe('Deals — edit then save', () => {
  const openEditModal = async () => {
    const dealCard = await screen.findByText('Deal 1');
    fireEvent.click(dealCard);
    await screen.findByTestId('deal-form-modal');
  };

  it('closes the modal after saving an edited deal', async () => {
    render(<Deals />);
    await openEditModal();

    fireEvent.click(screen.getByText('stub-save'));

    await waitFor(() => {
      expect(screen.queryByTestId('deal-form-modal')).not.toBeInTheDocument();
    });
    expect(mockPut).toHaveBeenCalledWith(expect.stringContaining('/deals/d1'), expect.anything());
    expect(mockPost).not.toHaveBeenCalled();
  });
});
