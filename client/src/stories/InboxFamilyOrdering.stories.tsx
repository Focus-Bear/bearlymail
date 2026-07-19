/**
 * Visual stories for inbox category ordering (fix for the Action/Follow Up
 * cross-family score inversion):
 *  - Triage keeps the two-level family accordion. A family block sits at its
 *    highest category's position, so a family's lower-priority categories can
 *    render above other families' higher-priority ones.
 *  - Action and Follow Up render the flat list in strict top-score-descending
 *    order (familyGroupingAppliesTo returns false for those modes).
 *
 * Uses the real components and the real ordering functions with a fixture
 * category list whose names include their top thread score for readability.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { Email, InboxMode } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { familyGroupingAppliesTo, orderCategoriesByFamily } from 'components/inbox/inboxFamilyGrouping';
import { InboxFamilyHeader } from 'components/inbox/InboxFamilyHeader';
import { MODE_ACTION, MODE_TRIAGE } from 'constants/strings';
import { NotificationProvider } from 'contexts/NotificationContext';
import { CategorySummaryItem } from 'store/slices/emailSlice';

import { categoryAccordionI18n } from './storyHelpers/i18nInstances';

const meta = {
  title: 'Inbox/FamilyOrdering',
  parameters: { layout: 'padded' },
};
export default meta;

/** Sorted by top thread score descending — exactly how the server returns the summary. */
const CATEGORIES: CategorySummaryItem[] = [
  { id: 'payments', name: 'Payments (top score 72)', count: 3 },
  { id: 'phd', name: 'PhD research (top score 40)', count: 1 },
  { id: 'recruitment', name: 'Recruitment (top score 35)', count: 2 },
  { id: 'fundraising', name: 'Fundraising: investors/grants (top score 24)', count: 1 },
];

const FAMILY_BY_CATEGORY_ID = new Map<string, string>([
  ['payments', 'MONEY & FUNDING'],
  ['fundraising', 'MONEY & FUNDING'],
  ['phd', 'PEOPLE, HR & ACADEMIA'],
  ['recruitment', 'PEOPLE, HR & ACADEMIA'],
]);

const EMPTY_FAMILY_MAP = new Map<string, string>();

const OrderedList: React.FC<{ mode: InboxMode }> = ({ mode }) => {
  const grouping = orderCategoriesByFamily(
    CATEGORIES,
    familyGroupingAppliesTo(mode) ? FAMILY_BY_CATEGORY_ID : EMPTY_FAMILY_MAP,
  );
  const familyCounts = new Map<string, number>();
  grouping.familyByKey.forEach(family => familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1));

  return (
    <I18nextProvider i18n={categoryAccordionI18n}>
      <NotificationProvider>
        <div style={{ maxWidth: 720, fontFamily: 'system-ui, sans-serif' }}>
          {grouping.ordered.map(category => {
            const key = category.id ?? category.name;
            const family = grouping.familyByKey.get(key);
            return (
              <React.Fragment key={key}>
                {grouping.firstInFamily.has(key) && family && (
                  <InboxFamilyHeader
                    family={family}
                    categoryCount={familyCounts.get(family) ?? 0}
                    isCollapsed={false}
                    onToggle={() => undefined}
                  />
                )}
                <CategoryAccordion
                  category={category.name}
                  categoryId={category.id}
                  emails={[] as Email[]}
                  count={category.count}
                  isExpanded={false}
                  onToggle={() => undefined}
                  onArchiveAll={async () => undefined}
                >
                  {null}
                </CategoryAccordion>
              </React.Fragment>
            );
          })}
        </div>
      </NotificationProvider>
    </I18nextProvider>
  );
};

export const TriageGroupedByFamily = {
  name: 'Triage — family blocks (score inversion possible across families)',
  render: () => <OrderedList mode={MODE_TRIAGE} />,
};

export const ActionStrictScoreOrder = {
  name: 'Action / Follow Up — flat, strict top-score descending',
  render: () => <OrderedList mode={MODE_ACTION} />,
};
