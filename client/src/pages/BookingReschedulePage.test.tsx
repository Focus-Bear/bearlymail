import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import BookingReschedulePage from './BookingReschedulePage';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const mockBooking = {
  id: 'booking-1',
  userId: 'user-1',
  guestEmail: 'guest@example.com',
  guestName: 'Guest',
  startTime: '2024-01-15T10:00:00.000Z',
  endTime: '2024-01-15T10:30:00.000Z',
  durationMinutes: 30,
  title: 'Test Meeting',
  status: 'active',
};

const mockSlots = {
  slots: [
    { start: '2024-01-16T10:00:00Z', end: '2024-01-16T10:30:00Z', duration: 30 },
    { start: '2024-01-16T14:00:00Z', end: '2024-01-16T14:30:00Z', duration: 30 },
  ],
  timezone: 'UTC',
};

const renderWithRouter = (token: string) => {
  return render(
    <MemoryRouter initialEntries={[`/booking/${token}/reschedule`]}>
      <Routes>
        <Route path="/booking/:token/reschedule" element={<BookingReschedulePage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('BookingReschedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state initially', () => {
    mockedAxios.get.mockImplementation(() => new Promise(() => {}));
    renderWithRouter('test-token');
    expect(screen.getByText('booking.loading')).toBeInTheDocument();
  });

  it('should display booking details and slots after loading', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/booking/')) {
        return Promise.resolve({ data: mockBooking });
      }
      return Promise.resolve({ data: mockSlots });
    });

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.reschedule.title')).toBeInTheDocument();
    });
  });

  it('should show error for cancelled booking', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/booking/')) {
        return Promise.resolve({ data: { ...mockBooking, status: 'cancelled' } });
      }
      return Promise.resolve({ data: mockSlots });
    });

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.reschedule.alreadyCancelled')).toBeInTheDocument();
    });
  });

  it('should show error when booking fails to load', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Not found'));

    renderWithRouter('invalid-token');

    await waitFor(() => {
      expect(screen.getByText('booking.reschedule.failedToLoad')).toBeInTheDocument();
    });
  });

  it('should show success state after rescheduling', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/booking/')) {
        return Promise.resolve({ data: mockBooking });
      }
      return Promise.resolve({ data: mockSlots });
    });
    mockedAxios.post.mockResolvedValue({ data: { id: 'event-1' } });

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.reschedule.title')).toBeInTheDocument();
    });

    // Select a slot
    const slotButtons = screen.getAllByRole('button');
    const slotButton = slotButtons.find(btn => !btn.textContent?.includes('booking.reschedule'));
    if (slotButton) {
      fireEvent.click(slotButton);
    }

    // Click reschedule button
    const rescheduleButton = screen.getByText('booking.reschedule.confirmReschedule');
    fireEvent.click(rescheduleButton);

    await waitFor(() => {
      expect(screen.getByText('booking.reschedule.success')).toBeInTheDocument();
    });
  });
});
