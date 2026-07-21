// Common numeric constants to avoid magic numbers

// Time unit conversions
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
export const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

// Early-morning schedule quick option ("Today 8:30am"). Offered only while the
// user's local time is before this cutoff, so scheduling for later this morning
// still makes sense.
export const EARLY_MORNING_SCHEDULE_HOUR = 8;
export const EARLY_MORNING_SCHEDULE_MINUTE = 30;

// Opacity values
export const OPACITY_DISABLED = 0.6;
export const OPACITY_DISABLED_ALT = 0.7;
export const OPACITY_FULL = 1;
export const OPACITY_HALF = 0.5;

// Timeout values (in milliseconds)
export const TOAST_DURATION_MS = 3000;
export const MILLISECONDS_PER_MINUTE = 60000;

// Character limits
export const MAX_PREVIEW_LENGTH = 150;
export const MAX_TEXTAREA_HEIGHT_PX = 200;
export const MAX_OPTION_LENGTH = 50;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_SEARCH_RESULT_LENGTH = 200;
export const MIN_SCORE_VALUE = -100;
/** Min length for hex-like category `contextValue` treated as opaque in category debug UI */
export const CATEGORY_DEBUG_OPAQUE_HEX_MIN_LEN = 32;
/** Truncate raw category value preview in category debug */
export const CATEGORY_DEBUG_RAW_NAME_PREVIEW_CHARS = 48;

// Width values
export const SIDEBAR_WIDTH_PX = 50;
export const INPUT_WIDTH_PX = 80;
export const MODAL_WIDTH_LARGE = 800;
export const MODAL_WIDTH_MEDIUM = 600;
export const MODAL_WIDTH_SMALL = 500;
export const TOOLTIP_MIN_WIDTH_SMALL = 320;
export const TOOLTIP_MAX_WIDTH_SMALL = 420;
export const TOOLTIP_MIN_WIDTH_MEDIUM = 350;
export const TOOLTIP_MAX_WIDTH_MEDIUM = 500;

// Score/percentage values
export const MAX_URGENCY_SCORE = 90;
export const MAX_PERCENTAGE = 100;
export const URGENCY_THRESHOLD = 90;
export const URGENCY_CRITICAL = 95;
export const URGENCY_HIGH = 85;
export const URGENCY_HIGH_THRESHOLD = 60;
export const URGENCY_MODERATE = 75;
// Priority tier thresholds — aligned with PRIORITY_RANGES in useInboxFilters.ts
// < 0 = very low, 0–15 = low, 15–30 = medium, 30–50 = high, > 50 = very high
export const PRIORITY_VERY_HIGH_THRESHOLD = 50;
export const PRIORITY_HIGH_THRESHOLD = 30;
export const PRIORITY_MEDIUM_THRESHOLD = 15;
export const PRIORITY_LOW_THRESHOLD = 0;
export const URGENCY_MEDIUM = 40;
export const URGENCY_LOW = 30;

// Text truncation
export const TOOLTIP_PREVIEW_MAX_CHARS = 1000;
export const TEXT_TRUNCATE_LENGTH = 150;
export const MESSAGE_ID_PREVIEW_LENGTH = 20;
export const NOTES_PREVIEW_MAX_CHARS = 60;
export const SUMMARY_PREVIEW_MAX_CHARS = 80;

// Z-index values
export const Z_INDEX_MODAL_OVERLAY = 10000;
export const Z_INDEX_POPUP = 2000;
export const Z_INDEX_DROPDOWN = 1000;

// Viewport heights
export const VIEWPORT_HEIGHT_90 = '90vh';
export const VIEWPORT_HEIGHT_75 = '75vh';

// HTTP status codes
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_PAYMENT_REQUIRED = 402;
export const HTTP_FORBIDDEN = 403;

/** Minimum gap between showings of the AI-limit banner (measured from when it last appeared), so repeat 402s after a dismissal don't nag. */
export const AI_LIMIT_BANNER_RESHOW_MS = 60000;

// Timeout values (additional)
export const DEBOUNCE_DELAY_MS = 300;
export const LONG_TIMEOUT_MS = 10000;
export const SHORT_TIMEOUT_MS = 2000;
/** How long the ✅ "priority calculated" confirmation shows after the spinner resolves. */
export const PRIORITY_CALCULATED_FLASH_MS = 2000;
export const POLLING_INTERVAL_MS = 2000; // 2 seconds
/** How often the empty inbox polls GET /emails/sync-status while a first sync runs. */
export const SYNC_STATUS_POLL_INTERVAL_MS = 4000; // 4 seconds
/** Stop polling sync-status after this many consecutive "not syncing" ticks. */
export const SYNC_STATUS_IDLE_POLL_LIMIT = 2;
/** Stop recategorise progress spinner when backend keeps reporting total=0 for this many polls. */
export const RECATEGORIZE_ZERO_TOTAL_MAX_POLLS = 12;
export const TOAST_DURATION_SHORT_MS = 3000; // 3 seconds (already have TOAST_DURATION_MS = 3000)
export const POLLING_TIMEOUT_2_MIN_MS = 120000; // 2 minutes
export const POLLING_TIMEOUT_5_MIN_MS = 300000; // 5 minutes
export const DELAY_1_SECOND_MS = 1000; // 1 second
export const DELAY_1_5_SECONDS_MS = 1500; // 1.5 seconds

// Calendar/date ranges
export const CALENDAR_DAYS_AHEAD = 90;
export const CALENDAR_DAYS_BACK = 30;
export const DAYS_PER_YEAR = 365;
export const DEFAULT_MEETING_DURATION_MINUTES = 30;

// Font sizes (in pixels)
export const FONT_SIZE_XS_PX = 12;
export const FONT_SIZE_SM_PX = 14;
export const FONT_SIZE_MD_PX = 16;

// Other common values
export const DEFAULT_ICON_SIZE_PX = 16;
export const DEFAULT_AVATAR_SIZE_PX = 50;
export const AVATAR_SIZE_SMALL_PX = 24;
export const MAX_BULK_SEND_COUNT = 20;
export const INBOX_FETCH_LIMIT = 500;
export const DEBOUNCE_DELAY_SHORT_MS = 300;

// Dimensions
export const WIDTH_FULL_PX = '100%' as const;
export const MARGIN_BOTTOM_NEG_2PX = '-2px' as const;
export const WIDTH_64_PX = 64;
export const HEIGHT_64_PX = 64;
export const WIDTH_32_PX = 32;
export const HEIGHT_32_PX = 32;
export const MAX_WIDTH_500_PX = 500;
export const MAX_WIDTH_600_PX = 600;
export const MAX_WIDTH_800_PX = 800;

// Opacity
export const OPACITY_90_PERCENT = 0.9;
export const OPACITY_20_PERCENT = 0.2;
export const OPACITY_10_PERCENT = 0.1;
export const OPACITY_30_PERCENT = 0.3;

// Responsive breakpoints (in pixels)
export const BREAKPOINT_TABLET = 640;
export const BREAKPOINT_DESKTOP = 1280;

// Percentage values for urgency score ranges
export const URGENCY_SCORE_CRITICAL_MIN = 95;
export const URGENCY_SCORE_HIGH_MIN = 85;
export const URGENCY_SCORE_MODERATE_MIN = 75;
export const URGENCY_SCORE_MEDIUM_MIN = 40;
export const URGENCY_SCORE_LOW_MIN = 30;

// Percentage values for progress indicators
export const PROGRESS_25_PERCENT = 12.5;
export const PROGRESS_50_PERCENT = 37.5;
export const PROGRESS_75_PERCENT = 62.5;
export const PROGRESS_87_5_PERCENT = 87.5;

// Progress thresholds for analysis
export const PROGRESS_THRESHOLD_30 = 30;
export const PROGRESS_THRESHOLD_40 = 40;
export const PROGRESS_THRESHOLD_75 = 75;
export const PROGRESS_THRESHOLD_85 = 85;
export const PROGRESS_THRESHOLD_95 = 95;

// Additional common numeric values
export const DEBOUNCE_DELAY_200_MS = 200;
export const TIMEOUT_300_MS = 300;
export const TIMEOUT_800_MS = 800;
export const SCROLL_OFFSET_50_PX = 50;
export const SCROLL_OFFSET_200_PX = 200;
export const SCROLL_OFFSET_NEGATIVE_100_PX = -100;
export const SCROLL_OFFSET_NEGATIVE_50_PX = -50;
export const TEXT_OFFSET_20_PX = 20;
export const TEXT_OFFSET_50_PX = 50;
export const ICON_SIZE_16_PX = 16;
export const MONTHS_IN_YEAR = 12;
export const DAYS_IN_MONTH_30 = 30;
export const CALENDAR_BOOKING_MAX_DAYS_AHEAD = 180;
export const PERCENTAGE_60 = 60;
export const PERCENTAGE_80 = 80;
export const PERCENTAGE_12_5 = 12.5;
export const PERCENTAGE_37_5 = 37.5;
export const PERCENTAGE_62_5 = 62.5;
export const PERCENTAGE_87_5 = 87.5;
export const PERCENTAGE_20 = 20;
export const STAR_COUNT_THRESHOLD_50 = 50;
export const STAR_COUNT_THRESHOLD_20 = 20;
export const TRIAGE_SUGGESTIONS_LIMIT_20 = 20;
export const DEFAULT_PRIORITY_SCORE = 50; // Default priority score for emails without calculated priority
export const SEARCH_RESULT_WIDTH_80_PX = 80;
export const ISO_DATETIME_STRING_LENGTH = 16; // ISO datetime format length (YYYY-MM-DDTHH:mm)
export const HOURS_12_HOUR_FORMAT = 12; // Used for 12-hour time format conversion
export const PADDING_START_2 = 2; // Padding length for time formatting

// Number formatting thresholds
export const NUMBER_FORMAT_THOUSAND = 1000;
export const NUMBER_FORMAT_MILLION = 1000000;

// Animation/transition durations
export const EXIT_ANIMATION_DURATION_MS = 300;
export const ERROR_NOTIFICATION_DURATION_MS = 6000;
export const UNDO_TOAST_DURATION_MS = 5000; // 5 seconds for undo-toast countdown before committing
export const TOAST_ENTRANCE_DELAY_MS = 10; // Small delay to trigger entrance CSS animation
export const TOAST_ACTION_FOCUS_DELAY_MS = 50; // Delay before focusing action button for accessibility
export const AUTO_SAVE_INTERVAL_MS = 10000;
export const SAVE_CONFIRMATION_DURATION_MS = 2000;
export const POLLING_DELAY_MS = 500;

// Scheduling options
export const SCHEDULING_GAP_15_MIN = 15;
export const SCHEDULING_GAP_30_MIN = 30;
export const SCHEDULING_GAP_45_MIN = 45;
export const SCHEDULING_GAP_60_MIN = 60;
export const SCHEDULING_GAP_90_MIN = 90;

// Font weight values for inline styles
export const FONT_WEIGHT_BOLD_INLINE = 700;
export const FONT_WEIGHT_NORMAL_INLINE = 400;
export const FONT_WEIGHT_SEMIBOLD = 600;
export const FONT_WEIGHT_MEDIUM = 500;

// Date/time constants
export const ANALYSIS_RECENT_INSIGHTS_COUNT = 7;
export const CONTEXT_ANALYSIS_RECENT_COUNT = 5;
export const MAX_RETRIES_POLLING = 30;
export const HOURS_IN_TWO_DAYS = 48;
export const DAYS_IN_MONTH_MAX = 31;
export const STATS_PERIOD_14_DAYS = 14;
export const CHART_BAR_MAX_WIDTH = 600;
export const CHART_BAR_HEIGHT_OFFSET = 20;
export const SUBJECT_PREVIEW_LENGTH = 50;
export const REFRESH_INTERVAL_30_SEC_MS = 30000;

// Email body processing
export const SIGNATURE_MIN_CONTENT_CHARS = 200; // Minimum content length before signature detection
export const TEXT_SEARCH_LAST_CHARS = 100; // Number of last characters to search for in HTML position matching
export const MIN_CONTENT_BEFORE_BOUNDARY = 20; // Minimum content before email boundary
export const HTML_CUT_POINT_OFFSET_100 = 100; // Offset for finding HTML cut point
export const HTML_CUT_POINT_OFFSET_50 = 50; // Offset for finding HTML cut point
export const BLOCKQUOTE_MIN_POSITION = 20; // Minimum position before blockquote detection
export const BOUNDARY_FALLBACK_SEARCH_CHARS = 20; // Chars of boundary text used in fallback HTML search
export const SIGNATURE_MIN_CONTENT_PLAINTEXT = 100; // Minimum content for plain text signature detection

export const MAX_BADGE_DISPLAY = 99; // Maximum badge count before showing 99+

// HTTP status thresholds
export const HTTP_SERVER_ERROR_THRESHOLD = 500; // 5xx errors are server-side; below this is a client error

// Retry constants
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1000;

// Backoff / retry constants (used by usePollingWithBackoff)
export const BACKOFF_RETRY_BUFFER_MS = 50; // buffer added to backoff delay to ensure window has elapsed
export const BACKOFF_BASE_MS = 1_000; // 1s initial backoff
export const BACKOFF_MAX_MS = 30_000; // 30s ceiling
export const BACKOFF_MULTIPLIER = 2; // exponential factor
export const BACKOFF_JITTER_MS = 500; // ±500ms random jitter
export const HTTP_TOO_MANY_REQUESTS = 429;
export const RETRY_AFTER_MIN_MS = 5_000; // floor when Retry-After is missing/too small
export const MAX_CATEGORY_FETCH_RETRIES = 4; // give up after 4 attempts (useEmailFetching)
export const MAX_POLL_RETRIES_429 = 5; // give up after 5 consecutive 429s (useAnalysisProgress)

// File size units
export const BYTES_PER_KB = 1024;
export const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;

export const CATEGORY_FETCH_RETRY_DELAY_MS = 5_000; // default retry delay for category fetch errors
