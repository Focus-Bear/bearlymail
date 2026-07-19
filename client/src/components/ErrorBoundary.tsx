import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { generateCorrelationId, isNetworkError } from 'utils/correlationId';
import { captureException } from 'utils/posthog';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  correlationId: string | null;
  isNetworkErr: boolean;
}

interface ErrorFallbackProps {
  correlationId: string;
  isNetworkErr: boolean;
}

const ERROR_FALLBACK_STYLES = {
  secondaryText: '#666',
  tertiaryText: '#999',
  actionBackground: '#007bff',
  actionTextColor: 'white',
};

/**
 * Fallback UI rendered when an error is caught.
 * Functional component so it can use hooks (useTranslation).
 */
const ErrorFallback: React.FC<ErrorFallbackProps> = ({ correlationId, isNetworkErr }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        {isNetworkErr ? t('errorBoundary.networkTitle') : t('errorBoundary.title')}
      </h1>
      <p style={{ marginBottom: '1rem', color: ERROR_FALLBACK_STYLES.secondaryText }}>
        {isNetworkErr ? t('errorBoundary.networkMessage') : t('errorBoundary.message')}
      </p>
      <p style={{ marginBottom: '1.5rem', color: ERROR_FALLBACK_STYLES.tertiaryText, fontSize: '0.875rem' }}>
        {t('errorBoundary.correlationId', { id: correlationId })}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          backgroundColor: ERROR_FALLBACK_STYLES.actionBackground,
          color: ERROR_FALLBACK_STYLES.actionTextColor,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        {t('errorBoundary.reloadButton')}
      </button>
    </div>
  );
};

/**
 * Error Boundary component to catch React errors and report them to PostHog.
 * Generates a 5-character correlation ID per error for cross-referencing with PostHog.
 * Detects network-related errors and shows a context-appropriate message.
 * See: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    correlationId: null,
    isNetworkErr: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      correlationId: generateCorrelationId(),
      isNetworkErr: isNetworkError(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { correlationId, isNetworkErr } = this.state;

    // Log error to PostHog with component stack and correlation ID
    captureException(error, {
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      correlationId,
      isNetworkError: isNetworkErr,
    });

    // Also log to console for development
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { correlationId, isNetworkErr } = this.state;

      return <ErrorFallback correlationId={correlationId ?? ''} isNetworkErr={isNetworkErr} />;
    }

    return this.props.children;
  }
}
