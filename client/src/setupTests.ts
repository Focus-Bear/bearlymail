// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock import.meta.env for Jest (Vite-specific feature)
// This is needed because Jest doesn't support import.meta.env natively
Object.defineProperty(globalThis, 'import', {
  value: {
    meta: {
      env: {
        VITE_API_URL: 'http://localhost:3001',
        VITE_POSTHOG_KEY: '',
        VITE_POSTHOG_HOST: '',
        MODE: 'test',
        DEV: false,
        PROD: false,
      },
    },
  },
  writable: true,
});
