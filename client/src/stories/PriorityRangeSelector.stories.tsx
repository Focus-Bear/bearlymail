/**
 * PriorityRangeSelector stories — isolated stories for the priority range filter.
 *
 * Fix #1571: Added stories for:
 * 1. Default state (all priorities selected, no filter)
 * 2. Filtered state (High to Very High)
 * 3. Mobile abbreviated labels (compact mode with VL/L/M/H/VH)
 *
 * These stories import the REAL PriorityRangeSelector component.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';

import { PriorityRangeSelector } from 'components/inbox/PriorityRangeSelector';

import { inboxFiltersI18n } from './storyHelpers/i18nInstances';

// ── Demo wrapper (stateful) ───────────────────────────────────────────────────

interface DemoProps {
  initialMin: number | null;
  initialMax: number | null;
  bucketCounts?: Record<string, number>;
  totalCount?: number;
  /** Simulate mobile viewport (compact labels). */
  forceMobile?: boolean;
  containerWidth?: number;
}

/**
 * Stateful wrapper — allows interactive slider drag in Storybook without
 * needing a Redux/context provider.
 */
const PriorityRangeSelectorDemo: React.FC<DemoProps> = ({
  initialMin,
  initialMax,
  bucketCounts,
  totalCount,
  forceMobile: _forceMobile,
  containerWidth = 480,
}) => {
  const [min, setMin] = useState<number | null>(initialMin);
  const [max, setMax] = useState<number | null>(initialMax);

  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ padding: '24px', background: '#f8fafc', width: containerWidth }}>
        <PriorityRangeSelector
          selectedMin={min}
          selectedMax={max}
          onChange={(newMin, newMax) => {
            setMin(newMin);
            setMax(newMax);
          }}
          bucketCounts={bucketCounts}
          totalCount={totalCount}
        />
      </div>
    </I18nextProvider>
  );
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof PriorityRangeSelectorDemo> = {
  title: 'Inbox/PriorityRangeSelector',
  component: PriorityRangeSelectorDemo,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Dual-thumb priority range slider. Supports tap-to-set-minimum on mobile, ' +
          'abbreviated labels in compact mode, and a Reset button when a filter is active.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PriorityRangeSelectorDemo>;

// ── Stories ───────────────────────────────────────────────────────────────────

/**
 * Default state — no filter active, all five priority buckets selected.
 * The "All priorities" label appears in the header; no Reset button is shown.
 */
export const Default: Story = {
  name: 'Default — All priorities',
  args: {
    initialMin: null,
    initialMax: null,
    bucketCounts: {
      'Very Low': 4,
      'Low': 12,
      'Medium': 31,
      'High': 18,
      'Very High': 7,
    },
    totalCount: 72,
    containerWidth: 480,
  },
  parameters: {
    docs: {
      description: {
        story:
          'No filter applied. Both thumbs sit at the outer edges. All bucket labels and ' +
          'segments are fully opaque. The header shows "All priorities".',
      },
    },
  },
};

/**
 * Filtered state — High to Very High.
 * The Reset button appears; lower-priority buckets are dimmed.
 */
export const FilteredHighToVeryHigh: Story = {
  name: 'Filtered — High to Very High',
  args: {
    // selectedMin=30 → High bucket; selectedMax=null → no upper cap (VH included)
    initialMin: 30,
    initialMax: null,
    bucketCounts: {
      'Very Low': 4,
      'Low': 12,
      'Medium': 31,
      'High': 18,
      'Very High': 7,
    },
    totalCount: 25,
    containerWidth: 480,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Filter set to High → Very High (score ≥ 30). The min thumb is on the High bucket. ' +
          'Very Low, Low, and Medium segments are dimmed. A "Reset" button appears in the header.',
      },
    },
  },
};

/**
 * Mobile abbreviated labels — simulates narrow (375px) viewport.
 * Labels show VL / L / M / H / VH instead of full names.
 *
 * Note: in production, `compact` mode is driven by `useResponsiveBreakpoints`.
 * This story constrains the container to 375px to show the abbreviated label
 * behaviour. For a true mobile simulation use the Storybook viewport addon.
 */
export const MobileAbbreviatedLabels: Story = {
  name: 'Mobile — abbreviated labels (375px)',
  args: {
    initialMin: null,
    initialMax: null,
    bucketCounts: {
      'Very Low': 4,
      'Low': 12,
      'Medium': 31,
      'High': 18,
      'Very High': 7,
    },
    totalCount: 72,
    containerWidth: 375,
    forceMobile: true,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story:
          'Container constrained to 375 px (typical iPhone width). On a real mobile device ' +
          '`useResponsiveBreakpoints` returns `isMobile=true`, which switches labels to VL/L/M/H/VH ' +
          'and increases thumb size (32px) and track height (12px) for easier tapping.',
      },
    },
  },
};
