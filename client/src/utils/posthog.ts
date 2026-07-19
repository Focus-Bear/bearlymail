import posthog from 'posthog-js';

import { TYPEOF_UNDEFINED } from 'constants/strings';

// Initialize PostHog if API key is provided
export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (apiKey) {
    posthog.init(apiKey, {
      api_host: apiHost,
      // Enable PostHog's native exception autocapture so errors appear in the
      // Error Tracking dashboard with the required $exception_list format.
      // This replaces the manual window.addEventListener('error', ...) handlers.
      // @ts-expect-error exception_autocapture is a valid PostHog config option not yet in @types
      exception_autocapture: true,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
        recordCrossOriginIframes: false,
      },
      loaded: posthog => {
        if (import.meta.env.DEV) {
          console.log('PostHog loaded');
        }
      },
    });
  }
};

// Helper function to identify user (NO PII - no email, no names)
export const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
  try {
    if (!isPostHogLoaded()) {
      return;
    }

    // Ensure no PII in properties
    const safeProperties = properties ? { ...properties } : {};
    // Explicitly remove any PII that might have been passed
    delete safeProperties.email;
    delete safeProperties.name;

    posthog.identify(userId, safeProperties);
  } catch (error) {
    console.error('PostHog identify failed:', error);
  }
};

// Helper function to capture events with validation
export const captureEvent = (eventName: string, properties?: Record<string, unknown>) => {
  try {
    if (!isPostHogLoaded()) {
      return;
    }

    // Ensure no PII in properties
    const safeProperties = properties ? { ...properties } : {};
    // Explicitly remove any PII
    delete safeProperties.email;
    delete safeProperties.name;
    delete safeProperties.query; // Search queries are PII
    delete safeProperties.rule_text; // Full rule text might contain PII

    posthog.capture(eventName, safeProperties);
  } catch (error) {
    console.error('PostHog capture failed:', error);
  }
};

// Helper function to reset user (on logout)
export const resetPostHog = () => {
  try {
    if (!isPostHogLoaded()) {
      return;
    }
    posthog.reset();
  } catch (error) {
    console.error('PostHog reset failed:', error);
  }
};

// Helper function to capture exceptions (errors) with stack traces
// Uses posthog.captureException() which sends the $exception_list format
// required by PostHog's Error Tracking dashboard.
export const captureException = (error: Error, additionalContext?: Record<string, unknown>) => {
  try {
    if (!isPostHogLoaded()) {
      console.error('PostHog not loaded, exception not tracked:', error.name, error.message);
      return;
    }

    // Remove PII from additional context before sending
    const safeContext = additionalContext ? { ...additionalContext } : {};
    delete safeContext.email;
    delete safeContext.name;
    delete safeContext.query;

    // Use PostHog's native captureException which formats the event correctly
    // for the Error Tracking dashboard (uses $exception_list internally).
    posthog.captureException(error, safeContext);
  } catch (captureError) {
    // Don't throw errors when trying to capture errors
    console.error('Failed to capture exception to PostHog:', captureError);
  }
};

// Helper function to check if PostHog is loaded
export const isPostHogLoaded = (): boolean => {
  try {
    return typeof posthog !== TYPEOF_UNDEFINED && posthog.has_opted_out_capturing !== undefined;
  } catch {
    return false;
  }
};

// Export posthog instance for direct use (use captureEvent helper instead when possible)
export { posthog };
