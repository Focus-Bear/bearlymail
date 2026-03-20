import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Email, getEmailPriorityScore, InboxMode } from 'types/email';

import { CategoryAccordion } from 'components/inbox/CategoryAccordion';
import { EmailListItem } from 'components/inbox/EmailListItem';
import { ProtoCategorySubAccordion } from 'components/inbox/ProtoCategorySubAccordion';
import { CATEGORY_OTHER, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { CategorySummaryItem } from 'store/slices/emailSlice';

interface CategorySectionProps {
  categoryItem: CategorySummaryItem;
  catIdx: number;
  displayCategories: CategorySummaryItem[];
  expandedCategories: Set<string>;
  loadedCategoryNames: string[] | undefined;
  emailCategoryMap: Map<string, { category: string; emails: Email[] }>;
  mode: InboxMode;
  selectedEmailIds: Set<string>;
  selectedEmailIndex: number;
  triageSuggestions: Map<string, any>;
  followUpDataMap: Map<string, any>;
  priorityTooltip: any;
  keyboardHint: any;
  snoozeInput: any;
  emailActions: any;
  modals: any;
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent) => void;
  updateDraft?: (followUpId: string, draft: string) => Promise<void>;
  handleSendFollowUp: (followUpId: string, draft: string, recipientName?: string) => Promise<void>;
  onBulkArchive: (emailIds: string[]) => Promise<void>;
  onToggleCategory: (category: string) => void;
  otherProtoGroups: Array<{ name: string; emails: Email[] }>;
  protoCategories: any[];
  isReanalysingOther: boolean;
  convertingProtoCategoryId: string | null;
  deletingProtoCategoryId: string | null;
  handleReanalyseOther: () => void;
  handleConvertProtoCategory: (id: string, name: string) => void;
  handleDeleteProtoCategoryFromInbox: (id: string) => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  categoryItem,
  catIdx,
  displayCategories,
  expandedCategories,
  loadedCategoryNames,
  emailCategoryMap,
  mode,
  selectedEmailIds,
  selectedEmailIndex,
  triageSuggestions,
  followUpDataMap,
  priorityTooltip,
  keyboardHint,
  snoozeInput,
  emailActions,
  modals,
  onEmailClick,
  onEmailSelect,
  updateDraft,
  handleSendFollowUp,
  onBulkArchive,
  onToggleCategory,
  otherProtoGroups,
  protoCategories,
  isReanalysingOther,
  convertingProtoCategoryId,
  deletingProtoCategoryId,
  handleReanalyseOther,
  handleConvertProtoCategory,
  handleDeleteProtoCategoryFromInbox,
}) => {
  const navigate = useNavigate();
  const categoryName = categoryItem.name;
  // Use the UUID key when available so all lookups are immune to name-encoding issues
  const categoryKey = getCategoryKey(categoryItem.id, categoryName);
  const isExpanded = expandedCategories.has(categoryKey);
  const isLoaded = (loadedCategoryNames ?? []).includes(categoryKey);
  const group = emailCategoryMap.get(categoryKey);
  const categoryEmails = group?.emails ?? [];

  // Only hide if we've successfully loaded AND both local emails and server count are zero.
  // Without the count check, a fetch error (isLoaded=true, emails=[]) would silently hide
  // a category that actually has emails according to the summary.
  if (isLoaded && categoryEmails.length === 0 && categoryItem.count === 0) {
    return null;
  }

  let globalIndex = 0;
  for (let i = 0; i < catIdx; i++) {
    const prevKey = getCategoryKey(displayCategories[i].id, displayCategories[i].name);
    const prevGroup = emailCategoryMap.get(prevKey);
    globalIndex += prevGroup?.emails.length ?? 0;
  }

  const renderEmailItem = (email: Email, emailIndex: number) => {
    const suggestion = mode === MODE_TRIAGE ? triageSuggestions.get(email.id) || null : null;
    const isSelected = selectedEmailIds.has(email.id) || selectedEmailIndex === emailIndex;
    const followUpData = mode === MODE_FOLLOW_UP ? followUpDataMap.get(email.threadId) : null;
    return (
      <EmailListItem
        key={email.id}
        email={email}
        index={emailIndex}
        mode={mode}
        isSelected={isSelected}
        suggestion={suggestion}
        priorityTooltip={priorityTooltip}
        keyboardHint={keyboardHint}
        snoozeInput={snoozeInput}
        onEmailClick={onEmailClick}
        onEmailSelect={onEmailSelect}
        onSetStarCount={emailActions.handleSetStarCount}
        onArchive={emailActions.handleArchive}
        onBlockSender={emailActions.handleBlockSender}
        onSnooze={emailActions.handleSnooze}
        onOverrideUrgency={() => {
          if (email.emailThreadId && email.urgencyScore !== undefined) {
            modals.showUrgencyOverride(email.emailThreadId, email.urgencyScore);
          }
        }}
        onProvideFeedback={() => {
          priorityTooltip.hidePriorityTooltip();
          modals.showPriorityFeedback(email.id, getEmailPriorityScore(email));
        }}
        followUpData={followUpData}
        onUpdateDraft={updateDraft}
        onSendFollowUp={(followUpId: string, draft: string) =>
          handleSendFollowUp(followUpId, draft, (email as any).otherPersonName)
        }
        recipientName={(email as any).otherPersonName}
      />
    );
  };

  const isOtherCategory = categoryName === CATEGORY_OTHER;
  const hasProtoGroups = isOtherCategory && otherProtoGroups.length > 0;
  const protoGroupedEmailIds = hasProtoGroups
    ? new Set(otherProtoGroups.flatMap(grp => grp.emails.map(event => event.id)))
    : new Set<string>();
  const uncategorizedOtherEmails = hasProtoGroups
    ? categoryEmails.filter(event => !protoGroupedEmailIds.has(event.id))
    : [];

  return (
    <CategoryAccordion
      key={categoryKey}
      category={categoryName}
      emails={categoryEmails}
      count={isLoaded ? categoryEmails.length : categoryItem.count}
      isLoadingContent={isExpanded && !isLoaded}
      isExpanded={isExpanded}
      onToggle={() => onToggleCategory(categoryKey)}
      onArchiveAll={(_category: string, emailIds: string[]) => onBulkArchive(emailIds)}
      onReanalyseOther={handleReanalyseOther}
      isReanalysingOther={isReanalysingOther}
      onNavigateToSettings={() => navigate('/settings#email-categories')}
    >
      {hasProtoGroups
        ? (() => {
            let offset = 0;
            return (
              <>
                {otherProtoGroups.map(grp => {
                  const groupStart = offset;
                  offset += grp.emails.length;
                  const protoCategory = protoCategories.find((pc: any) => pc.name === grp.name);
                  return (
                    <ProtoCategorySubAccordion
                      key={grp.name}
                      name={grp.name}
                      description={protoCategory?.description}
                      emailCount={grp.emails.length}
                      onConvertToCategory={async () => {
                          handleConvertProtoCategory(protoCategory?.id ?? '', grp.name);
                        }}
                      isConverting={convertingProtoCategoryId === protoCategory?.id && protoCategory !== undefined}
                      onArchiveAll={onBulkArchive}
                      emailIds={grp.emails.map(email => email.id)}
                      onDelete={protoCategory ? async () => {
                          handleDeleteProtoCategoryFromInbox(protoCategory.id);
                        } : undefined}
                      isDeleting={deletingProtoCategoryId === protoCategory?.id && protoCategory !== undefined}
                    >
                      {grp.emails.map((email, idx) => renderEmailItem(email, globalIndex + groupStart + idx))}
                    </ProtoCategorySubAccordion>
                  );
                })}
                {uncategorizedOtherEmails.map((email, idx) => renderEmailItem(email, globalIndex + offset + idx))}
              </>
            );
          })()
        : categoryEmails.map((email, idx) => renderEmailItem(email, globalIndex + idx))}
    </CategoryAccordion>
  );
};
