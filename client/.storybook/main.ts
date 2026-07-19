import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook-only stand-in for config/revenuecat: the real module reads
 * import.meta.env.VITE_REVENUECAT_API_KEY, which Vite inlines at build time,
 * so stories couldn't toggle the checkout/fallback states in a built Storybook.
 * The mock reads a runtime global set per-story instead.
 */
const revenueCatMockPath = fileURLToPath(
  new URL('../src/stories/storyHelpers/revenuecat.storybook.ts', import.meta.url),
);

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: false,
  },
  viteFinal: async config => {
    config.server = config.server ?? {};
    config.server.allowedHosts = true;
    config.resolve = config.resolve ?? {};
    const existingAlias = Array.isArray(config.resolve.alias)
      ? config.resolve.alias
      : Object.entries(config.resolve.alias ?? {}).map(([find, replacement]) => ({ find, replacement }));
    config.resolve.alias = [{ find: /^config\/revenuecat$/, replacement: revenueCatMockPath }, ...existingAlias];
    return config;
  },
};

export default config;
