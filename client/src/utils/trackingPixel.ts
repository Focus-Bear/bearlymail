import { TRACKING_PIXEL_IMG_PATTERN } from 'constants/openTracking';

/**
 * Removes open-tracking pixels from an HTML body before it is rendered, so the
 * user viewing their own sent mail (or a reply quoting it) never counts as an
 * open. The server already strips them; this is the client-side safety net.
 */
export function stripTrackingPixels(html: string): string {
  return html.replace(TRACKING_PIXEL_IMG_PATTERN, '');
}
