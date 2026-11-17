import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ACTION_TAB_EMPHASIS } from 'constants/actionMove';

import { InboxHeaderTabs } from './InboxHeaderTabs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const BADGE_TEST_ID = 'action-tab-moved-badge';

function renderTabs(props: Partial<React.ComponentProps<typeof InboxHeaderTabs>> = {}) {
  const onActionTabEmphasisEnd = vi.fn();
  const setMode = vi.fn();
  render(
    <InboxHeaderTabs
      mode="triage"
      setMode={setMode}
      loadingModeSwitch={false}
      triageTabRef={{ current: null }}
      actionTabRef={{ current: null }}
      followUpTabRef={{ current: null }}
      onActionTabEmphasisEnd={onActionTabEmphasisEnd}
      {...props}
    />
  );
  return { onActionTabEmphasisEnd, setMode };
}

// React listens for whichever animation-end name the environment supports (jsdom: prefixed).
const ANIMATION_END_EVENT_NAMES = ['animationend', 'webkitAnimationEnd'];

function fireAnimationEnd(element: HTMLElement) {
  ANIMATION_END_EVENT_NAMES.forEach(name => fireEvent(element, new Event(name, { bubbles: true })));
}

function actionTab(): HTMLElement {
  return screen.getByText('inbox.actionTab').closest('button') as HTMLElement;
}

describe('InboxHeaderTabs — moved-to-Action feedback', () => {
  it('shows a "+N" badge while emails have moved to Action unseen', () => {
    renderTabs({ actionMovedCount: 2 });

    expect(screen.getByTestId(BADGE_TEST_ID)).toHaveTextContent('inbox.actionMove.badge:2');
  });

  it('shows no badge when nothing has moved', () => {
    renderTabs();

    expect(screen.queryByTestId(BADGE_TEST_ID)).toBeNull();
  });

  it('bounces the tab on the first move', () => {
    renderTabs({ actionTabEmphasis: ACTION_TAB_EMPHASIS.FIRST_TIME });
    expect(actionTab()).toHaveClass('animate-tab-bounce');
  });

  it('ends the emphasis only when the tab animation ends, not the badge pop inside it', () => {
    const { onActionTabEmphasisEnd } = renderTabs({
      actionTabEmphasis: ACTION_TAB_EMPHASIS.SUBTLE,
      actionMovedCount: 1,
    });
    expect(actionTab()).toHaveClass('animate-tab-pulse');

    const badge = screen.getByTestId(BADGE_TEST_ID);
    fireAnimationEnd(badge);
    expect(onActionTabEmphasisEnd).not.toHaveBeenCalled();

    fireAnimationEnd(actionTab());
    expect(onActionTabEmphasisEnd).toHaveBeenCalledTimes(1);
  });
});
