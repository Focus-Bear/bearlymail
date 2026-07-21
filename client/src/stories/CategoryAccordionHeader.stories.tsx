/**
 * Visual stories for the inbox category accordion header:
 *  - a real category with the settings cog and the overflow (⋮) menu offering
 *    "Auto archive this category" behind a confirmation dialog
 *  - the "Other" bucket, which has no settings page (Recategorise lives in its
 *    overflow menu instead)
 *
 * Uses the real component with a scoped i18n instance so screenshots reflect production styling.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Email } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { NotificationProvider } from 'contexts/NotificationContext';

import { categoryAccordionI18n } from './storyHelpers/i18nInstances';

const meta = {
  title: 'Inbox/CategoryAccordionHeader',
  parameters: { layout: 'padded' },
};
export default meta;

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={categoryAccordionI18n}>
    <NotificationProvider>
      <div style={{ maxWidth: 760, fontFamily: 'system-ui, sans-serif' }}>{children}</div>
    </NotificationProvider>
  </I18nextProvider>
);

const StatefulAccordion: React.FC<{
  category: string;
  count: number;
  other?: boolean;
  family?: string;
}> = ({ category, count, other, family }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <CategoryAccordion
      category={category}
      categoryId={other ? null : 'story-category-id'}
      family={family}
      emails={[] as Email[]}
      count={count}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(open => !open)}
      onArchiveAll={async () => undefined}
      onReanalyseOther={other ? () => undefined : undefined}
    >
      {null}
    </CategoryAccordion>
  );
};

export const RealCategoryWithCog = {
  name: 'Real category — cog + overflow menu (auto-archive)',
  render: () => (
    <Wrap>
      <StatefulAccordion category="GitHub Notifications" count={12} />
    </Wrap>
  ),
};

export const WithFamilyLabel = {
  name: 'Flat mode — family shown as a small label on the card',
  render: () => (
    <Wrap>
      <StatefulAccordion category="New Human-Created GitHub Issues" count={32} family="GitHub / Issues" />
    </Wrap>
  ),
};

export const OtherCategory = {
  name: '“Other” — no cog, Recategorise in overflow menu',
  render: () => (
    <Wrap>
      <StatefulAccordion category="Other" count={7} other />
    </Wrap>
  ),
};
