/**
 * Shared i18n instances for Storybook stories.
 * Each instance is scoped to the translation keys required by a specific component.
 */
import { initReactI18next } from 'react-i18next';
import i18n from 'i18next';

// ---------- ActionItemsSection ----------
export const actionItemsI18n = i18n.createInstance();
actionItemsI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.actionItems': 'Action Items',
        'emailDetail.noActionItems': 'No action items',
        'emailDetail.extracting': 'Extracting…',
        'emailDetail.suggestActions': 'Suggest actions',
        'emailDetail.regenerateActions': 'Regenerate',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- SummarySection ----------
export const summarySectionI18n = i18n.createInstance();
summarySectionI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.aiSummary': 'AI Summary',
        'emailDetail.generatingSummary': 'Generating summary…',
        'emailDetail.noSummary': 'No summary available.',
        'emailDetail.createCustomRule': 'Create custom rule',
        'emailDetail.summaryTypes.tldr': 'TL;DR',
        'emailDetail.summaryTypes.bulletPoints': 'Bullet Points',
        'emailDetail.summaryTypes.actionItems': 'Action Items',
        'emailDetail.summaryTypes.senderRequest': "Sender's Request",
        'emailDetail.summaryTypes.customRules': 'Custom Rules',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- PrivateNotesSection ----------
export const privateNotesI18n = i18n.createInstance();
privateNotesI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.privateNotes': 'Private Notes',
        'emailDetail.privateNotesPlaceholder': 'Add a private note… only you can see this.',
        'emailDetail.onlyVisibleToYou': 'Only visible to you.',
        'emailDetail.onlyVisibleToYouSaved': 'Only visible to you. Saved {{duration}} ago.',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- ReplyComposerFooter ----------
export const replyComposerI18n = i18n.createInstance();
replyComposerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.send': 'Send',
        'emailDetail.sending': 'Sending…',
        'emailDetail.checkingTone': 'Checking tone…',
        'emailDetail.scheduledFor': 'Sending {{date}}',
        'emailDetail.cancel': 'Cancel',
        'emailDetail.stillNeedToAct': 'I still need to take action',
        'emailDetail.expectedReplyLabel': 'Expect a reply within',
        'emailDetail.expectedReply.none': 'No follow-up',
        'emailDetail.expectedReply.hours': '{{count}}h',
        'emailDetail.expectedReply.days': '{{count}}d',
        'emailDetail.expectedReply.customPlaceholder': 'e.g., 48h, 3d, next Monday',
        'emailDetail.expectedReply.customTooltip':
          "Enter a time like '48h', '3d', '5pm', 'tomorrow', or 'next Monday'. Leave blank for no follow-up.",
        'emailDetail.expectedReplyTooltip.none': 'No follow-up reminder will be set for this email.',
        'emailDetail.expectedReplyTooltip.hours':
          "If they don't reply within {{count}}h, the email will reappear in your follow-up inbox.",
        'emailDetail.expectedReplyTooltip.days':
          "If they don't reply within {{count}} days, the email will reappear in your follow-up inbox.",
        'emailDetail.keepInActionTooltip':
          'Helpful if you are just letting the other person know you got their message and still need to take action yourself.',
        'emailDetail.scheduleModalTitle': 'Schedule send',
        'emailDetail.scheduleCustom': 'Pick date & time...',
        'emailDetail.scheduleSuggestions.thisAfternoon': 'This afternoon',
        'emailDetail.scheduleSuggestions.tomorrowMorning': 'Tomorrow morning',
        'emailDetail.scheduleSuggestions.mondayMorning': 'Monday morning',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- SplitViewPanelShell ----------
export const splitViewI18n = i18n.createInstance();
splitViewI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'inbox.emailDetails': 'Email Details',
        'inbox.openInNewTab': 'Open in new tab',
        'inbox.closePanel': 'Close panel',
        'inbox.prioritise': 'Prioritise',
        'inbox.priorityHeading': 'Priority',
        'inbox.setPriority': 'Set priority',
        'inbox.priorityTrainsAi': 'trains AI',
        'inbox.canWait': 'Can wait',
        'inbox.getOnIt': 'Get on it',
        'inbox.ohShit': 'Oh sh$t',
        'inbox.priorityCanWaitHint': 'Marked low urgency',
        'inbox.priorityGetOnItHint': 'Marked medium urgency',
        'inbox.priorityOhShitHint': 'Marked highest urgency',
        'emailDetail.replyAll': 'Reply All',
        'emailDetail.forward': 'Forward',
        'emailDetail.archive': 'Archive',
        'emailDetail.snooze': 'Snooze',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- InboxFilters ----------
export const inboxFiltersI18n = i18n.createInstance();
inboxFiltersI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'inbox.filters.account': 'Account',
        'inbox.filters.allAccounts': 'All accounts',
        'inbox.filters.noAccounts': 'No accounts',
        'inbox.filters.category': 'Category',
        'inbox.filters.categoryGroup': 'Category filter',
        'inbox.filters.allCategories': 'All',
        'inbox.filters.noCategories': 'No categories',
        'inbox.filters.priority': 'Priority Filter',
        'inbox.filters.priorityAll': 'All priorities',
        'inbox.filters.priorityMinHandle': 'Minimum priority',
        'inbox.filters.priorityMaxHandle': 'Maximum priority',
        'inbox.filters.resetPriority': 'Reset',
        'inbox.filters.moreCategories': 'more',
        'inbox.filters.showMoreCategories': 'Show {{count}} more categories',
        'inbox.filters.nCategoriesSelected': '{{count}} selected',
        'common.checkmark': '✓',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- EmailListItem ----------
export const emailListItemI18n = i18n.createInstance();
emailListItemI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'inbox.triage.movingToFollowUp': 'Moving to Follow Up',
        'inbox.triage.movingToAction': 'Moving to Action',
        'emailDetail.archive': 'Archive',
        'emailDetail.snooze': 'Snooze',
        'inbox.email.unread': 'Unread',
        'inbox.archive': 'Archive',
        'inbox.snooze': 'Snooze',
        'inbox.blockSender': 'Block sender',
        'inbox.unsubscribe': 'Unsubscribe',
        'emailDetail.moreOptions': 'More options',
        // Priority controls (PrioritySlider)
        'inbox.priorityHeading': 'Priority',
        'inbox.canWait': 'Can wait',
        'inbox.getOnIt': 'Get on it',
        'inbox.ohShit': 'Oh sh$t',
        'inbox.setPriority': 'Set priority',
        'inbox.priorityTrainsAi': 'trains AI',
        'inbox.priorityCaptionNone': 'Pick a priority to move this to the action tab',
        'inbox.priorityCanWaitHint': 'Marked low urgency',
        'inbox.priorityGetOnItHint': 'Marked medium urgency',
        'inbox.priorityOhShitHint': 'Marked highest urgency',
        // Follow-up metadata
        'inbox.followUpDetails.with': 'With',
        'inbox.followUpDetails.daysSinceResponse': 'Days since their last response',
        'inbox.followUpDetails.day': 'day',
        'inbox.followUpDetails.day_plural': 'days',
        'inbox.followUpDetails.status': 'Status',
        'inbox.followUpDetails.noReplyReceived': 'No reply received',
        'inbox.followUpDetails.youSentLast': 'You sent the last',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- Priority controls (PriorityChip / PriorityInlineSelector) ----------
export const priorityControlsI18n = i18n.createInstance();
priorityControlsI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'inbox.priorityHeading': 'Priority',
        'inbox.canWait': 'Can wait',
        'inbox.getOnIt': 'Get on it',
        'inbox.ohShit': 'Oh sh$t',
        'inbox.setPriority': 'Set priority',
        'inbox.priorityTrainsAi': 'trains AI',
        'inbox.priorityCaptionNone': 'Pick a priority to move this to the action tab',
        'inbox.priorityCanWaitHint': 'Marked low urgency',
        'inbox.priorityGetOnItHint': 'Marked medium urgency',
        'inbox.priorityOhShitHint': 'Marked highest urgency',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- CategoryAccordion header ----------
export const categoryAccordionI18n = i18n.createInstance();
categoryAccordionI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'inbox.category.editCategories': 'Edit category settings',
        'inbox.category.archiveAll': 'Archive All',
        'inbox.category.archiveAllTooltip': 'Archive every email in this category',
        'inbox.category.reanalyseCategories': 'Recategorise',
        'inbox.category.moreActions': 'More category actions',
        'inbox.category.autoArchiveMenuItem': 'Auto archive this category',
        'inbox.category.autoArchiveConfirmTitle': 'Auto-archive \u201c{{category}}\u201d?',
        'inbox.category.autoArchiveConfirmMessage':
          'New emails in \u201c{{category}}\u201d will be archived automatically and shown in the Blocked view instead of your inbox. If you change your mind, you can delete the workflow anytime in Settings \u2192 Workflows.',
        'inbox.category.autoArchiveConfirmCta': 'Auto-archive',
        'common.cancel': 'Cancel',
        'inbox.category.loadingContent': 'Loading…',
        'inbox.category.other': 'Other',
        'inbox.familyCategoryCount_one': '{{count}} category',
        'inbox.familyCategoryCount_other': '{{count}} categories',
      },
    },
  },
  interpolation: { escapeValue: false },
});

// ---------- IcsRescheduleSection ----------
export const icsRescheduleI18n = i18n.createInstance();
icsRescheduleI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'emailDetail.icsInvite.reschedule.title': 'Reschedule request',
        'emailDetail.icsInvite.reschedule.proposedBy': '{{name}} declined and proposed a new time',
        'emailDetail.icsInvite.reschedule.currentTime': 'Current time',
        'emailDetail.icsInvite.reschedule.proposedTime': 'Proposed new time',
        'emailDetail.icsInvite.reschedule.acceptCta': 'Accept new time',
        'emailDetail.icsInvite.reschedule.accepting': 'Accepting...',
        'emailDetail.icsInvite.reschedule.accepted': 'New time confirmed',
        'emailDetail.icsInvite.reschedule.declineCta': 'Keep original time',
        'emailDetail.icsInvite.reschedule.declining': 'Declining...',
        'emailDetail.icsInvite.reschedule.declined': 'Let them know — original time kept',
        'emailDetail.icsInvite.reschedule.error': 'Something went wrong updating the reschedule request',
        'emailDetail.icsInvite.reschedule.noMatchWarning':
          "Couldn't find this event on your calendar — add it to your calendar first, then try again.",
      },
    },
  },
  interpolation: { escapeValue: false },
});
