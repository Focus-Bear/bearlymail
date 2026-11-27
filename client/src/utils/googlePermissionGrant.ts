import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import {
  GOOGLE_PERMISSION_RESULT_PARAM,
  GOOGLE_PERMISSION_URL_PATH,
  IncrementalGooglePermissionGroup,
} from 'constants/strings';

/** Where Google should send the user back to: this page, minus any earlier grant result. */
function currentAppPath(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete(GOOGLE_PERMISSION_RESULT_PARAM);
  return `${url.pathname}${url.search}`;
}

/**
 * Sends the browser to Google's consent screen for just this group; Google
 * returns to the current page with `?googlePermission=<result>`. Rejects if
 * the consent URL can't be fetched, leaving the page where it is.
 */
export async function redirectToGooglePermissionGrant(group: IncrementalGooglePermissionGroup): Promise<void> {
  captureEvent(ANALYTICS_EVENTS.GOOGLE_PERMISSION_REQUESTED, { permission: group });
  const response = await axios.get<{ url: string }>(`${API_URL}${GOOGLE_PERMISSION_URL_PATH}`, {
    params: { permission: group, returnTo: currentAppPath() },
  });
  window.location.assign(response.data.url);
}
