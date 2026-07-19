import React from 'react';
import { render, screen } from '@testing-library/react';
import * as correlationId from 'utils/correlationId';
import * as posthog from 'utils/posthog';

import { ErrorBoundary } from './ErrorBoundary';

// Suppress console.error noise from intentional error throws in tests
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  (console.error as jest.Mock).mockRestore();
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return `${key}:${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));

vi.mock('utils/posthog', () => ({
  captureException: vi.fn(),
}));

vi.mock('utils/correlationId', () => ({
  generateCorrelationId: vi.fn(() => 'TESTA'),
  isNetworkError: vi.fn(() => false),
}));

// Component that throws on render
const ThrowingComponent: React.FC<{ error?: Error }> = ({ error = new Error('test error') }) => {
  throw error;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (correlationId.generateCorrelationId as jest.Mock).mockReturnValue('TESTA');
    (correlationId.isNetworkError as jest.Mock).mockReturnValue(false);
  });

  describe('when no error occurs', () => {
    it('renders children normally', () => {
      render(
        <ErrorBoundary>
          <div>Hello world</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
  });

  describe('when an error is caught', () => {
    it('renders the generic error fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('errorBoundary.title')).toBeInTheDocument();
      expect(screen.getByText('errorBoundary.message')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('displays the correlation ID', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText(`errorBoundary.correlationId:${JSON.stringify({ id: 'TESTA' })}`)).toBeInTheDocument();
    });

    it('reports the error to PostHog with the correlation ID', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(posthog.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          correlationId: 'TESTA',
          errorBoundary: true,
        })
      );
    });

    it('renders a custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom fallback</div>}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom fallback')).toBeInTheDocument();
      expect(screen.queryByText('errorBoundary.title')).not.toBeInTheDocument();
    });
  });

  describe('when a network error is caught', () => {
    beforeEach(() => {
      (correlationId.isNetworkError as jest.Mock).mockReturnValue(true);
    });

    it('renders the network-specific error message', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error('Network Error')} />
        </ErrorBoundary>
      );

      expect(screen.getByText('errorBoundary.networkTitle')).toBeInTheDocument();
      expect(screen.getByText('errorBoundary.networkMessage')).toBeInTheDocument();
    });

    it('reports isNetworkError: true to PostHog', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error('Network Error')} />
        </ErrorBoundary>
      );

      expect(posthog.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          isNetworkError: true,
          errorBoundary: true,
        })
      );
    });

    it('still displays the correlation ID for network errors', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent error={new Error('Network Error')} />
        </ErrorBoundary>
      );

      expect(screen.getByText(`errorBoundary.correlationId:${JSON.stringify({ id: 'TESTA' })}`)).toBeInTheDocument();
    });
  });
});
