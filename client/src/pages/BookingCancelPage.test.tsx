import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import BookingCancelPage from './BookingCancelPage';

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

const renderWithRouter = (token: string) => {
  return render(
    <MemoryRouter initialEntries={[`/booking/${token}/cancel`]}>
      <Routes>
        <Route path="/booking/:token/cancel" element={<BookingCancelPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('BookingCancelPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state initially', () => {
    mockedAxios.get.mockImplementation(() => new Promise(() => {}));
    renderWithRouter('test-token');
    expect(screen.getByText('booking.loading')).toBeInTheDocument();
  });

  it('should display booking details after loading', async () => {
    mockedAxios.get.mockResolvedValue({ data: mockBooking });

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.title')).toBeInTheDocument();
    });
    expect(screen.getByText('booking.cancel.confirmCancel')).toBeInTheDocument();
  });

  it('should show already cancelled message', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { ...mockBooking, status: 'cancelled' },
    });

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.alreadyCancelled')).toBeInTheDocument();
    });
  });

  it('should show error when booking fails to load', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Not found'));

    renderWithRouter('invalid-token');

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.failedToLoad')).toBeInTheDocument();
    });
  });

  it('should show success state after cancelling', async () => {
    mockedAxios.get.mockResolvedValue({ data: mockBooking });
    mockedAxios.post.mockResolvedValue({
      data: { success: true, message: 'Booking cancelled successfully' },
    });

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.confirmCancel')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('booking.cancel.confirmCancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.success')).toBeInTheDocument();
    });
  });

  it('should show error when cancellation fails', async () => {
    mockedAxios.get.mockResolvedValue({ data: mockBooking });
    mockedAxios.post.mockRejectedValue(new Error('Failed'));

    renderWithRouter('test-token');

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.confirmCancel')).toBeInTheDocument();
    });

    const cancelButton = screen.getByText('booking.cancel.confirmCancel');
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.getByText('booking.cancel.failedToCancel')).toBeInTheDocument();
    });
  });
});
