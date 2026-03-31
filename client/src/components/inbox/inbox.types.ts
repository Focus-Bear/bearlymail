/**
 * Shared inbox component prop types derived from useInboxState return shape.
 * Using ReturnType<> ensures these stay in sync with the hook implementation.
 */
import { useInboxState } from 'hooks/useInboxState';

type InboxStateReturn = ReturnType<typeof useInboxState>;

export type InboxPriorityTooltip = InboxStateReturn['priorityTooltip'];
export type InboxKeyboardHint = InboxStateReturn['keyboardHint'];
export type InboxSnoozeInput = InboxStateReturn['snoozeInput'];
export type InboxEmailActions = InboxStateReturn['emailActions'];
export type InboxModals = InboxStateReturn['modals'];
