import React from 'react';
import type { Preview, Decorator } from '@storybook/react';

const withWrapper: Decorator = Story => (
  <div
    style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: '24px',
      backgroundColor: '#F5F5F5',
      minHeight: '100vh',
    }}
  >
    <Story />
  </div>
);

const preview: Preview = {
  decorators: [withWrapper],
  parameters: {
    backgrounds: {
      default: 'light gray',
      values: [
        { name: 'light gray', value: '#F5F5F5' },
        { name: 'white', value: '#FFFFFF' },
      ],
    },
  },
};

export default preview;
