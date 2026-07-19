/**
 * Pure helper functions for the Sidebar component.
 * Extracted to enable unit testing of navigation-structure business logic.
 */
import { NavigateFunction } from 'react-router-dom';

/** Delay (ms) before scrolling to a settings anchor after navigation. */
export const SIDEBAR_SCROLL_DELAY_MS = 50;

export interface SettingsSubNavItem {
  id: string;
  label: string;
  anchor: string;
}

export interface SettingsSubNavGroup {
  label: string;
  items: SettingsSubNavItem[];
}

type TFunction = (key: string) => string;

export interface SettingsNavOptions {
  /** Whether the current user is an admin (gates admin-only items like MFA). */
  isAdmin?: boolean;
}

/**
 * Returns the full settings sidebar navigation tree, translated via the
 * provided `translate` function.
 *
 * @param translate - i18n translation function (`t` from `useTranslation()`).
 * @param options - Flags that gate conditional items (e.g. admin-only MFA).
 * @returns An ordered array of navigation groups, each with labelled items.
 */
export function getSettingsNavItems(
  translate: TFunction,
  options: SettingsNavOptions = {}
): (SettingsSubNavItem | SettingsSubNavGroup)[] {
  return [
    {
      label: translate('settings.nav.accountSecurity'),
      items: [
        { id: 'set-password', label: translate('settings.nav.password'), anchor: 'set-password' },
        ...(options.isAdmin ? [{ id: 'mfa', label: translate('settings.nav.twoFactorAuth'), anchor: 'mfa' }] : []),
      ],
    },
    {
      label: translate('settings.nav.emailDelivery'),
      items: [
        { id: 'google-accounts', label: translate('settings.nav.googleAccounts'), anchor: 'google-accounts' },
        { id: 'email-batching', label: translate('settings.nav.emailBatching'), anchor: 'email-batching' },
        { id: 'blocked-senders', label: translate('settings.nav.blockedSenders'), anchor: 'blocked-senders' },
        { id: 'email-signature', label: translate('settings.nav.emailSignature'), anchor: 'email-signature' },
      ],
    },
    {
      label: translate('settings.nav.guideOurAI'),
      items: [
        { id: 'context', label: translate('settings.contextAboutMeTitle'), anchor: 'context' },
        { id: 'email-categories', label: translate('settings.nav.emailCategories'), anchor: 'email-categories' },
        { id: 'tone-settings', label: translate('settings.nav.toneSettings'), anchor: 'tone-settings' },
        { id: 'summarization', label: translate('settings.nav.summarization'), anchor: 'summarization' },
        { id: 'auto-responder', label: translate('settings.nav.autoResponder'), anchor: 'auto-responder' },
      ],
    },
    {
      label: translate('settings.nav.schedulingPreferences'),
      items: [
        {
          id: 'scheduling-availability',
          label: translate('settings.nav.schedulingAvailability'),
          anchor: 'scheduling-availability',
        },
        {
          id: 'scheduling-meeting-gap',
          label: translate('settings.nav.schedulingMeetingGap'),
          anchor: 'scheduling-meeting-gap',
        },
        {
          id: 'scheduling-deep-work',
          label: translate('settings.nav.schedulingDeepWork'),
          anchor: 'scheduling-deep-work',
        },
        {
          id: 'scheduling-slot-duration',
          label: translate('settings.nav.schedulingSlotDuration'),
          anchor: 'scheduling-slot-duration',
        },
        {
          id: 'scheduling-timezone',
          label: translate('settings.nav.schedulingTimezone'),
          anchor: 'scheduling-timezone',
        },
        {
          id: 'scheduling-booking-link',
          label: translate('settings.nav.schedulingBookingLink'),
          anchor: 'scheduling-booking-link',
        },
      ],
    },
    {
      label: translate('settings.nav.integrationsApps'),
      items: [
        { id: 'connected-apps', label: translate('settings.nav.connectedApps'), anchor: 'connected-apps' },
        { id: 'workflows', label: translate('settings.nav.workflows'), anchor: 'workflows' },
        { id: 'github-integration', label: translate('settings.nav.githubIntegration'), anchor: 'github-integration' },
        { id: 'api-key', label: translate('settings.nav.openAiApiKey'), anchor: 'api-key' },
        { id: 'anthropic-api-key', label: translate('settings.nav.anthropicApiKey'), anchor: 'anthropic-api-key' },
      ],
    },
    {
      label: translate('settings.nav.teamPlan'),
      items: [
        { id: 'team-members', label: translate('settings.nav.teamMembers'), anchor: 'team-members' },
        { id: 'team-usage', label: translate('settings.nav.teamUsage'), anchor: 'team-usage' },
        { id: 'team-promo', label: translate('settings.nav.teamPromo'), anchor: 'team-promo' },
      ],
    },
    {
      label: translate('settings.nav.dataAccount'),
      items: [
        { id: 'data-export', label: translate('settings.nav.dataExport'), anchor: 'data-export' },
        { id: 'troubleshooting', label: translate('settings.nav.troubleshooting'), anchor: 'troubleshooting' },
        { id: 'account-deletion', label: translate('settings.nav.deleteAccount'), anchor: 'account-deletion' },
      ],
    },
  ];
}

/**
 * Returns a scroll-to-section handler bound to the given `navigate` function.
 *
 * Navigates to `/settings#<anchor>` and then, after a short delay, scrolls
 * the matching DOM element into view.
 *
 * @param navigate - React Router `navigate` function from `useNavigate()`.
 * @returns A function that accepts an anchor string and performs the scroll.
 */
export function makeScrollToSection(navigate: NavigateFunction): (anchor: string) => void {
  return (anchor: string) => {
    navigate(`/settings#${anchor}`, { replace: true });
    setTimeout(() => {
      const element = document.getElementById(anchor);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, SIDEBAR_SCROLL_DELAY_MS);
  };
}
