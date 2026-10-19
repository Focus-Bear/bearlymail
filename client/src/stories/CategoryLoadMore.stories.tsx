/**
 * An expanded category accordion holding only its first page of rows: the header shows the
 * full category count, and a "Show more" footer loads the next page on demand (PR #328).
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Email } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { CategoryLoadMoreButton } from 'components/inbox/CategoryLoadMoreButton';
import { NotificationProvider } from 'contexts/NotificationContext';

import { ItemDemo } from './storyHelpers/EmailListItemDemo';
import { categoryAccordionI18n } from './storyHelpers/i18nInstances';

const meta = {
  title: 'Inbox/CategoryLoadMore',
  parameters: { layout: 'padded' },
};
export default meta;

const CATEGORY_TOTAL = 72;
const ROWS_SHOWN = 2;

const PagedCategory: React.FC<{ isLoading: boolean }> = ({ isLoading }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <I18nextProvider i18n={categoryAccordionI18n}>
      <NotificationProvider>
        <div style={{ maxWidth: 760 }}>
          <CategoryAccordion
            category="GitHub Notifications"
            categoryId="story-category-id"
            emails={[] as Email[]}
            count={CATEGORY_TOTAL}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(open => !open)}
            onArchiveAll={async () => undefined}
          >
            {Array.from({ length: ROWS_SHOWN }, (_, index) => (
              <ItemDemo key={index} />
            ))}
            <CategoryLoadMoreButton
              remainingCount={CATEGORY_TOTAL - ROWS_SHOWN}
              isLoading={isLoading}
              onLoadMore={() => undefined}
            />
          </CategoryAccordion>
        </div>
      </NotificationProvider>
    </I18nextProvider>
  );
};

export const ShowMore = {
  name: 'Paged category — "Show more" footer',
  render: () => <PagedCategory isLoading={false} />,
};

export const LoadingMore = {
  name: 'Paged category — next page loading',
  render: () => <PagedCategory isLoading />,
};
