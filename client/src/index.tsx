import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from 'App';
import reportWebVitals from 'reportWebVitals';
import './i18n'; // Import i18n config
import { initPostHog, captureException } from 'utils/posthog';
import { ErrorBoundary } from 'components/ErrorBoundary';

// Initialize PostHog analytics
initPostHog();

// Global error handlers for uncaught errors and unhandled promise rejections
window.addEventListener('error', (event) => {
  captureException(event.error || new Error(event.message), {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    globalHandler: true,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason));

  captureException(error, {
    promiseRejection: true,
    globalHandler: true,
  });
});

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
