// Common numeric constants to avoid magic numbers

// Time unit conversions
export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
export const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

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
// New priority calibration: < 0 = very low, 0-20 = low, 20-40 = medium, > 40 = high
export const PRIORITY_HIGH_THRESHOLD = 40;
export const PRIORITY_MEDIUM_THRESHOLD = 20;
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
export const HTTP_FORBIDDEN = 403;

// Timeout values (additional)
export const DEBOUNCE_DELAY_MS = 300;
export const LONG_TIMEOUT_MS = 10000;
export const SHORT_TIMEOUT_MS = 2000;
export const POLLING_INTERVAL_MS = 2000; // 2 seconds
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
export const DEBOUNCE_DELAY_SHORT_MS = 300;

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
export const AUTO_SAVE_INTERVAL_MS = 10000;
export const SAVE_CONFIRMATION_DURATION_MS = 2000;
export const POLLING_DELAY_MS = 500;

// Scheduling options
export const SCHEDULING_GAP_15_MIN = 15;
export const SCHEDULING_GAP_45_MIN = 45;

// Font weight values for inline styles
export const FONT_WEIGHT_BOLD_INLINE = 700;
export const FONT_WEIGHT_NORMAL_INLINE = 400;

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
export const MIN_CONTENT_BEFORE_BOUNDARY_LESS_AGGRESSIVE = 50; // Less aggressive minimum content before boundary
export const HTML_CUT_POINT_OFFSET_100 = 100; // Offset for finding HTML cut point
export const HTML_CUT_POINT_OFFSET_50 = 50; // Offset for finding HTML cut point
export const BLOCKQUOTE_MIN_POSITION = 20; // Minimum position before blockquote detection
export const SIGNATURE_MIN_CONTENT_PLAINTEXT = 100; // Minimum content for plain text signature detection


