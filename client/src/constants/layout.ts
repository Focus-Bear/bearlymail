/** Minimum touch target size (px) per WCAG 2.5.5 / Apple HIG recommendations. */
export const TOUCH_TARGET_MIN_PX = 44;

/** Horizontal breathing room kept between a fixed/centered overlay and the screen edges. */
export const OVERLAY_VIEWPORT_MARGIN_PX = 32;

/**
 * Viewport-safe width bounds for fixed or centered overlays (toasts,
 * notifications, small modals) so they never overflow a narrow phone: the min
 * shrinks with the viewport instead of forcing a fixed floor, and the max never
 * exceeds the viewport minus a small margin. Spread into a style object:
 *
 *   style={{ ...overlayWidthBounds(300, 400) }}
 */
export function overlayWidthBounds(
  minPx: number,
  maxPx: number
): { minWidth: string; maxWidth: string } {
  const cap = `calc(100vw - ${OVERLAY_VIEWPORT_MARGIN_PX}px)`;
  return {
    minWidth: `min(${minPx}px, ${cap})`,
    maxWidth: `min(${maxPx}px, ${cap})`,
  };
}

// Named presets so overlay components spread ready-made bounds instead of passing
// raw pixel numbers. The px values are named here first (a bare literal assigned
// to a const is allowed) so no raw magic numbers reach the function calls.
const OVERLAY_MIN_W = 300;
const OVERLAY_MIN_W_WIDE = 320;
const TOAST_MAX_W = 400;
const TONE_TOAST_MAX_W = 420;
const PROGRESS_MODAL_MAX_W = 500;

export const TOAST_WIDTH_BOUNDS = overlayWidthBounds(OVERLAY_MIN_W, TOAST_MAX_W);
export const TONE_CHECK_TOAST_WIDTH_BOUNDS = overlayWidthBounds(OVERLAY_MIN_W, TONE_TOAST_MAX_W);
export const URGENT_NOTIFICATION_WIDTH_BOUNDS = overlayWidthBounds(OVERLAY_MIN_W_WIDE, TOAST_MAX_W);
export const ANALYSIS_MODAL_WIDTH_BOUNDS = overlayWidthBounds(OVERLAY_MIN_W, PROGRESS_MODAL_MAX_W);
