import './index.css';
import './i18n'; // Import i18n config

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from 'App';
import reportWebVitals from 'reportWebVitals';
import { initPostHog } from 'utils/posthog';

import { ErrorBoundary } from 'components/ErrorBoundary';

// Initialize PostHog analytics
// exception_autocapture: true (configured in initPostHog) handles uncaught errors
// and unhandled promise rejections automatically in the correct $exception_list
// format required by PostHog's Error Tracking dashboard.
initPostHog();

// Log build version on startup so support/devs can identify exact deploys from the console.
// __COMMIT_HASH__ and __BUILD_TIME__ are injected by vite.config.ts at build time.
console.log(`[BearlyMail] version: ${__COMMIT_HASH__} built: ${__BUILD_TIME__}`);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
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
