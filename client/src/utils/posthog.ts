import posthog from 'posthog-js';
import { ENV_DEVELOPMENT, TYPEOF_UNDEFINED } from 'constants/strings';

// Initialize PostHog if API key is provided
export const initPostHog = () => {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (apiKey) {
    posthog.init(apiKey, {
      api_host: apiHost,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
        recordCrossOriginIframes: false,
      },
      loaded: (posthog) => {
        if (import.meta.env.DEV) {
          console.log('PostHog loaded');
        }
      },
    });
  }
};

// Helper function to identify user (NO PII - no email, no names)
export const identifyUser = (userId: string, properties?: Record<string, any>) => {
  try {
    if (!isPostHogLoaded()) return;
    
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
export const captureEvent = (eventName: string, properties?: Record<string, any>) => {
  try {
    if (!isPostHogLoaded()) return;
    
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
    if (!isPostHogLoaded()) return;
    posthog.reset();
  } catch (error) {
    console.error('PostHog reset failed:', error);
  }
};

// Helper function to check if PostHog is loaded
export const isPostHogLoaded = (): boolean => {
  try {
    // eslint-disable-next-line no-restricted-syntax -- 'has_opted_out_capturing' is a PostHog API property name
    return typeof posthog !== TYPEOF_UNDEFINED && posthog.has_opted_out_capturing !== undefined;
  } catch {
    return false;
  }
};

// Export posthog instance for direct use (use captureEvent helper instead when possible)
export { posthog };
