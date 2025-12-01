import posthog from 'posthog-js';

// Initialize PostHog if API key is provided
export const initPostHog = () => {
  const apiKey = process.env.REACT_APP_POSTHOG_KEY;
  const apiHost = process.env.REACT_APP_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (apiKey) {
    posthog.init(apiKey, {
      api_host: apiHost,
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('PostHog loaded');
        }
      },
    });
  }
};

// Helper function to identify user
export const identifyUser = (userId: string, email?: string, properties?: Record<string, any>) => {
  try {
    posthog.identify(userId, {
      email,
      ...properties,
    });
  } catch (error) {
    console.error('PostHog identify failed:', error);
  }
};

// Helper function to reset user (on logout)
export const resetPostHog = () => {
  try {
    posthog.reset();
  } catch (error) {
    console.error('PostHog reset failed:', error);
  }
};

// Helper function to check if PostHog is loaded
export const isPostHogLoaded = (): boolean => {
  try {
    return typeof posthog !== 'undefined' && posthog.has_opted_out_capturing !== undefined;
  } catch {
    return false;
  }
};

// Export posthog instance for direct use
export { posthog };
