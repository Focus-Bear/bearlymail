export const ALERT_GITHUB_CONNECTED = 'GitHub connected successfully!' as const;
export const ALERT_GITHUB_CONNECT_FAILED = 'Failed to connect GitHub. Please try again.' as const;
export const LOADING_TEXT = 'Loading...' as const;

export const ALERT_THREAD_ID_COPIED = 'Thread ID copied to clipboard!' as const;
export const DEBUG_INFO_TITLE = 'Debug Information (Admin Only)' as const;
export const DEBUG_LABEL_GMAIL_MESSAGE_ID = 'Gmail Message ID:' as const;
export const DEBUG_LABEL_GMAIL_THREAD_ID = 'Gmail Thread ID:' as const;
export const DEBUG_LABEL_LABELS = 'Labels:' as const;
export const DEBUG_LABEL_LABELS_COUNT = 'Labels Count:' as const;
export const DEBUG_LABEL_RECEIVED_AT = 'Received At:' as const;
export const DEBUG_LABEL_IS_READ = 'Is Read:' as const;
export const DEBUG_LABEL_IS_ARCHIVED = 'Is Archived:' as const;
export const DEBUG_LABEL_STAR_COUNT = 'Star Count:' as const;
export const DEBUG_LABEL_THREAD_EMAILS = 'Thread Emails' as const;
export const DEBUG_LABEL_MSG_ID = 'MsgID:' as const;
export const DEBUG_LABEL_RECEIVED = 'Received:' as const;
export const STRING_NA = 'N/A' as const;
export const STRING_COPY = 'Copy' as const;
export const STRING_EMPTY_ARRAY = '[]' as const;
export const EVENT_EMAIL_DETAIL_VIEWED = 'email_detail_viewed' as const;
export const PROP_EMAIL_ID = 'email_id' as const;

// Common string constants to avoid magic strings
export const STRING_AUTO_ANALYZE = 'autoAnalyze' as const;
export const STRING_GITHUB_PARAM = 'github' as const;
export const ERROR_UPDATING_HISTORY = 'Error updating hasScannedHistory:' as const;
export const ARIA_LABEL_OPEN_NAV = 'Open navigation menu' as const;
export const STRING_ERROR = 'error' as const;
export const STYLE_100VH = '100vh' as const;
export const STYLE_48PX = '48px' as const;
export const STYLE_1_5REM = '1.5rem' as const;
export const STRING_PX = 'px' as const;
export const STRING_PERCENT = '%' as const;
export const STYLE_GAP_8PX = '8px' as const;
export const STYLE_PADDING_2PX_6PX = '2px 6px' as const;
export const STYLE_PADDING_2PX_8PX = '2px 8px' as const;
export const STYLE_FONT_SIZE_11PX = '11px' as const;
export const STYLE_RADIUS_4PX = '4px' as const;
export const STYLE_MAX_WIDTH_900PX = '900px' as const;
export const STYLE_MARGIN_0_AUTO = '0 auto' as const;

// Email modes (must match InboxMode type)
export const MODE_TRIAGE = 'triage' as const;
export const MODE_ACTION = 'action' as const;
export const MODE_FOLLOW_UP = 'follow-up' as const;
export const MODE_BLOCKED = 'blocked' as const;
export const MODE_AUTORESPONDED = 'autoresponded' as const;
export const MODE_SCHEDULED = 'scheduled' as const;

export type InboxModeType =
  | typeof MODE_TRIAGE
  | typeof MODE_ACTION
  | typeof MODE_FOLLOW_UP
  | typeof MODE_BLOCKED
  | typeof MODE_AUTORESPONDED
  | typeof MODE_SCHEDULED;

// Reply modes
export const REPLY_MODE_REPLY = 'reply' as const;
export const REPLY_MODE_REPLY_ALL = 'replyAll' as const;
export const REPLY_MODE_FORWARD = 'forward' as const;

// Action item sources
export const ACTION_ITEM_SOURCE_MANUAL = 'manual' as const;
export const ACTION_ITEM_SOURCE_AI = 'ai' as const;

// GitHub status values
export const GITHUB_STATUS_OPEN = 'open' as const;
export const GITHUB_STATUS_CLOSED = 'closed' as const;
export const GITHUB_STATUS_MERGED = 'merged' as const;
export const GITHUB_STATUS_DRAFT = 'draft' as const;

// GitHub issue states
export const GITHUB_STATE_OPEN = 'open' as const;
export const GITHUB_STATE_CLOSED = 'closed' as const;

// GitHub PR states
export const GITHUB_PR_STATE_OPEN = 'open' as const;
export const GITHUB_PR_STATE_CLOSED = 'closed' as const;
export const GITHUB_PR_STATE_MERGED = 'merged' as const;
export const GITHUB_PR_STATE_DRAFT = 'draft' as const;

// Follow-up status
export const FOLLOW_UP_STATUS_GENERATING = 'generating' as const;
export const FOLLOW_UP_STATUS_ERROR = 'error' as const;

// Debug panel tabs
export const DEBUG_TAB_STATS = 'stats' as const;

// Booking form status
export const BOOKING_STATUS_SUCCESS = 'success' as const;
export const BOOKING_STATUS_SUBMITTING = 'submitting' as const;
export const BOOKING_STATUS_CANCELLED = 'cancelled' as const;

// Action types
export const ACTION_TYPE_CUSTOM = 'Custom' as const;
export const ACTION_TYPE_GITHUB_CREATE_ISSUE = 'github_create_issue' as const;
export const ACTION_TYPE_GITHUB_UPDATE_STATUS = 'github_update_status' as const;
export const ACTION_TYPE_GITHUB_ADD_COMMENT = 'github_add_comment' as const;
export const ACTION_TYPE_GITHUB_SEARCH_ISSUES = 'github_search_issues' as const;
export const ACTION_TYPE_CALENDAR_CREATE_INVITE = 'calendar_create_invite' as const;
export const ACTION_TYPE_CALENDAR_FIND_EVENTS = 'calendar_find_events' as const;
export const ACTION_TYPE_SCHEDULING_REQUEST = 'scheduling_request' as const;

// Action type prefixes
export const GITHUB_ACTION_PREFIX = 'github_' as const;
export const CALENDAR_ACTION_PREFIX = 'calendar_' as const;

// GitHub review status
export const GITHUB_REVIEW_STATUS_APPROVED = 'approved' as const;
export const GITHUB_REVIEW_STATUS_CHANGES_REQUESTED = 'changes_requested' as const;
export const GITHUB_REVIEW_STATUS_PENDING = 'pending' as const;

// GitHub CI checks rollup states
export const GITHUB_CHECKS_STATE_PASSING = 'passing' as const;
export const GITHUB_CHECKS_STATE_FAILING = 'failing' as const;
export const GITHUB_CHECKS_STATE_PENDING = 'pending' as const;
export const GITHUB_CHECKS_STATE_NONE = 'none' as const;

// Follow-up send status
export const FOLLOW_UP_SEND_STATUS_SENT = 'sent' as const;
export const FOLLOW_UP_SEND_STATUS_FAILED = 'failed' as const;
export const FOLLOW_UP_SEND_STATUS_SENDING = 'sending' as const;

// Search result markers
export const SEARCH_RESULT_NO_RESULTS = 'no-results' as const;

// Summary types
export const SUMMARY_TYPE_CUSTOM = 'custom' as const;
export const SUMMARY_TYPE_CUSTOM_PREFIX = 'custom-' as const;

// Keyboard keys
export const KEY_ENTER = 'Enter' as const;
export const KEY_ESCAPE = 'Escape' as const;
export const KEY_SPACE = ' ' as const;
export const KEY_TAB = 'Tab' as const;
export const KEY_ARROW_DOWN = 'ArrowDown' as const;
export const KEY_ARROW_UP = 'ArrowUp' as const;
export const KEY_ARROW_LEFT = 'ArrowLeft' as const;
export const KEY_ARROW_RIGHT = 'ArrowRight' as const;
export const KEY_HOME = 'Home' as const;
export const KEY_END = 'End' as const;
export const KEY_J = 'j' as const;
export const KEY_K = 'k' as const;
export const KEY_DELETE = 'Delete' as const;
export const KEY_BACKSPACE = 'Backspace' as const;
export const KEY_E = 'e' as const;
export const KEY_Y = 'y' as const;
export const KEY_N = 'n' as const;

// Event types
export const EVENT_KEYDOWN = 'keydown' as const;

/**
 * Window CustomEvent fired when the user presses Delete while a category accordion is the active
 * (most-recently-opened) one and no email is keyboard-focused. The matching CategoryAccordion arms
 * its existing "Archive All" confirmation (Y to confirm). detail: { categoryKey: string }.
 */
export const INBOX_ARCHIVE_ALL_CATEGORY_EVENT = 'inbox:archive-all-category' as const;

// Error messages
export const ERROR_NETWORK = 'Network Error' as const;
export const ERROR_CODE_ERR_NETWORK = 'ERR_NETWORK' as const;
export const ERROR_GMAIL_REQUIRED = 'Gmail account connection required' as const;
export const ERROR_GMAIL = 'Gmail' as const;
export const ERROR_CODE_GMAIL_REQUIRED = 'GMAIL_REQUIRED' as const;

// API endpoints
export const API_ENDPOINT_USERS_ME = '/users/me' as const;

// Error codes returned by the API
export const AI_VOLUME_LIMIT_REACHED_CODE = 'AI_VOLUME_LIMIT_REACHED' as const;

// Deep link used by the AI-limit banner's "View plans" CTA. TeamSettingsSection
// reads the `plans=open` query param to auto-open the plan picker modal.
export const PLANS_QUERY_PARAM = 'plans' as const;
export const PLANS_QUERY_OPEN = 'open' as const;
export const SETTINGS_PLANS_ROUTE = '/settings?plans=open#team-usage' as const;

// HTTP methods
export const HTTP_METHOD_GET = 'get' as const;

// Environment
export const ENV_DEVELOPMENT = 'development' as const;

// Typeof checks
export const TYPEOF_STRING = 'string' as const;
export const TYPEOF_UNDEFINED = 'undefined' as const;

// Search progress steps
export const SEARCH_PROGRESS_CRAFTING = 'Crafting' as const;
export const SEARCH_PROGRESS_SEARCHING = 'Searching for emails' as const;
export const SEARCH_PROGRESS_FILTERING = 'Filtering' as const;
export const SEARCH_PROGRESS_GENERATING = 'Generating explanations' as const;

// Draft status
export const DRAFT_STATUS_PENDING = 'pending' as const;
export const DRAFT_STATUS_GENERATING = 'generating' as const;
export const DRAFT_STATUS_COMPLETED = 'completed' as const;
export const DRAFT_STATUS_ERROR = 'error' as const;

// Action item source
export const ACTION_ITEM_SOURCE_LLM = 'llm' as const;

// Context source
export const CONTEXT_SOURCE_AUTOGENERATED = 'AUTOGENERATED' as const;

// Context key
export const CONTEXT_KEY_Q_AND_A = 'Q_AND_A' as const;

// Context explanation keys
export const CONTEXT_EXPLANATION_VIP_CONTACT_STARRED = 'vipContactStarredExplanation' as const;

// Context source additional values
export const CONTEXT_SOURCE_USER_EDITED = 'USER_EDITED' as const;
export const CONTEXT_SOURCE_UNAPPROVED = 'UNAPPROVED' as const;

// Context key additional values
export const CONTEXT_KEY_WORKING_ON = 'WORKING_ON' as const;

// Button variants
export const BUTTON_VARIANT_PRIMARY = 'primary' as const;
export const BUTTON_VARIANT_SECONDARY = 'secondary' as const;

// Input types
export const INPUT_TYPE_TEXTAREA = 'textarea' as const;

// Email fields (standard field names, but extracted to constants for ESLint)
export const EMAIL_FIELD_TO = 'to' as const;
export const EMAIL_FIELD_CC = 'cc' as const;
export const EMAIL_FIELD_BCC = 'bcc' as const;

// Delivery status
export const DELIVERY_STATUS_OVERDUE = 'overdue' as const;

// Animation types
export const ANIMATION_TYPE_SEND = 'send' as const;
export const ANIMATION_TYPE_ARCHIVE = 'archive' as const;
export const ANIMATION_TYPE_PRIORITY = 'priority' as const;

// Link types
export const LINK_TYPE_ISSUE = 'issue' as const;
export const LINK_TYPE_PR = 'pr' as const;

// DOM node names
export const NODE_NAME_ANCHOR = 'A' as const;
export const NODE_NAME_SVG = 'SVG' as const;
export const NODE_NAME_USE = 'USE' as const;

// Email categories
export const CATEGORY_OTHER = 'Other' as const;
export const CATEGORY_DANGEROUS_PHISHING = 'Dangerous / Phishing' as const;

// Email providers
export const PROVIDER_GMAIL = 'gmail' as const;
export const PROVIDER_OFFICE365 = 'office365' as const;
export const PROVIDER_ZOHO = 'zoho' as const;
export const PROVIDER_APPLE_MAIL = 'apple-mail' as const;
export const PROVIDER_OUTLOOK = 'outlook' as const;
export const PROVIDER_GOOGLE = 'google' as const;
export const PROVIDER_OTHER = 'other' as const;

// Contact field types
export const FIELD_TYPE_NUMBER = 'number' as const;
export const FIELD_TYPE_DATE = 'date' as const;
export const FIELD_TYPE_URL = 'url' as const;
export const FIELD_TYPE_TEXT = 'text' as const;
export const FIELD_TYPE_PHONE = 'phone' as const;
export const FIELD_TYPE_COMPANY = 'company' as const;

// HTML input types (for custom fields, not to be confused with contact field types like FIELD_TYPE_PHONE)
export const INPUT_TYPE_NUMBER = 'number' as const;
export const INPUT_TYPE_DATE = 'date' as const;
export const INPUT_TYPE_URL = 'url' as const;
export const INPUT_TYPE_TEXT = 'text' as const;
export const INPUT_TYPE_TEL = 'tel' as const;

// Notification/Toast types
export const NOTIFICATION_TYPE_SUCCESS = 'success' as const;
export const NOTIFICATION_TYPE_ERROR = 'error' as const;
export const NOTIFICATION_TYPE_WARNING = 'warning' as const;
export const NOTIFICATION_TYPE_INFO = 'info' as const;

// Analysis/Job status
export const STATUS_FAILED = 'failed' as const;
export const STATUS_RUNNING = 'running' as const;
export const STATUS_COMPLETED = 'completed' as const;
export const STATUS_PENDING = 'pending' as const;

// Action/Email types
export const ACTION_TYPE_REPLY = 'reply' as const;

// Sort directions
export const SORT_ASC = 'asc' as const;
export const SORT_DESC = 'desc' as const;

// Filter options
export const FILTER_ALL = 'all' as const;

// Connection status
export const CONNECTION_STATUS_CONNECTED = 'connected' as const;

// Boolean string representations
export const STRING_TRUE = 'true' as const;
export const STRING_FALSE = 'false' as const;

// Summary types
export const SUMMARY_TYPE_TLDR = 'tldr' as const;
export const SUMMARY_TYPE_BULLETS = 'bullets' as const;
export const SUMMARY_TYPE_ACTIONS = 'actions' as const;

// `Email.summarySource`: a deterministic placeholder summary the detail view
// upgrades to a real LLM summary on open.
export const SUMMARY_SOURCE_DETERMINISTIC = 'deterministic' as const;

// DOM events
export const EVENT_CLICK = 'click' as const;

// Priority levels
export const PRIORITY_LEVEL_HIGH = 'high' as const;
export const PRIORITY_LEVEL_LOW = 'low' as const;
export const PRIORITY_LEVEL_STANDARD = 'standard' as const;

// Keyboard keys (additional)
export const KEY_Y_UPPERCASE = 'Y' as const;
export const KEY_COMMA = ',' as const;

// Priority status text
export const PRIORITY_STATUS_CALCULATING = 'Calculating...' as const;

// Route paths
export const ROUTE_INBOX = '/inbox' as const;
export const ROUTE_SEARCH = '/search' as const;
export const ROUTE_SETTINGS = '/settings' as const;
export const ROUTE_ADMIN = '/admin' as const;
export const ROUTE_STATS = '/stats' as const;
export const ROUTE_CRM = '/crm' as const;
export const ROUTE_CRM_CONTACTS = '/crm/contacts' as const;
export const ROUTE_CRM_DEALS = '/crm/deals' as const;
export const ROUTE_CRM_CONTACT_GROUPS = '/crm/contact-groups' as const;
export const ROUTE_SCHEDULED = '/scheduled' as const;
export const ROUTE_COMPOSE = '/compose' as const;
export const ROUTE_HELP = '/help' as const;

// Navigation state (location.state.from) sources
export const NAVIGATION_SOURCE_SEARCH = 'search' as const;

// URL query parameter holding the search query on the Search page
export const SEARCH_QUERY_PARAM = 'q' as const;

// Scroll behavior
export const SCROLL_BEHAVIOR_SMOOTH = 'smooth' as const;
export const SCROLL_BLOCK_START = 'start' as const;

// Auth Error Types
export const ERROR_TYPE_PENDING_APPROVAL = 'pending_approval' as const;
export const ERROR_TYPE_NOT_ON_WAITLIST = 'not_on_waitlist' as const;
export const ERROR_TYPE_AUTH_ERROR = 'auth_error' as const;

// Deletion reasons (must match server DeletionReason enum)
export const DELETION_REASON_INACTIVITY = 'inactivity' as const;
export const DELETION_REASON_MANUAL = 'manual' as const;

// Booking Status
export const BOOKING_IDLE = 'idle' as const;
export const BOOKING_SUBMITTING = 'submitting' as const;
export const BOOKING_SUCCESS = 'success' as const;
export const BOOKING_ERROR = 'error' as const;

// Common Strings
export const STRING_WAITLIST = 'waitlist' as const;
export const STRING_TYPE = 'type' as const;
export const STRING_MESSAGE = 'message' as const;
export const STRING_TRANSPARENT = 'transparent' as const;
export const STRING_WHITE = 'white' as const;
export const STRING_NONE = 'none' as const;
export const STRING_POINTER = 'pointer' as const;
export const STRING_NOT_ALLOWED = 'not-allowed' as const;
export const STRING_AUTO = '0 auto' as const;
export const STRING_HIDDEN = 'hidden' as const;
export const STRING_LONG = 'long' as const;
export const STRING_NUMERIC = 'numeric' as const;
export const STRING_2_DIGIT = '2-digit' as const;
export const STRING_CENTER = 'center' as const;
export const STRING_BLOCK = 'block' as const;
export const STRING_FLEX = 'flex' as const;
export const STRING_GRID = 'grid' as const;
export const STRING_FIXED = 'fixed' as const;
export const STRING_VERTICAL = 'vertical' as const;
export const STRING_COLUMN = 'column' as const;
export const STRING_COVER = 'cover' as const;
export const STRING_PRE_WRAP = 'pre-wrap' as const;
export const STRING_SPACE_BETWEEN = 'space-between' as const;
export const STRING_FLEX_END = 'flex-end' as const;
export const STRING_DEFAULT = 'default' as const;
export const STRING_NOWRAP = 'nowrap' as const;
export const STRING_ELLIPSIS = 'ellipsis' as const;
export const STRING_CURRENCY = 'currency' as const;
export const STRING_USD = 'USD' as const;
export const STRING_EN_US = 'en-US' as const;
export const STRING_SMOOTH = 'smooth' as const;
export const STRING_START = 'start' as const;
export const STRING_REPLY = 'reply' as const;
export const STRING_REPLY_ALL = 'replyAll' as const;
export const STRING_FORWARD = 'forward' as const;
export const STRING_MONOSPACE = 'monospace' as const;
export const STRING_TRUE_TEXT = 'true' as const;
export const STRING_FALSE_TEXT = 'false' as const;
export const STRING_RELATIVE = 'relative' as const;

// Additional shared constants for lint-safe comparisons
export const STRING_SM = 'sm' as const;
export const TYPEOF_OBJECT = 'object' as const;
export const TYPEOF_FUNCTION = 'function' as const;
export const STRING_UTC = 'UTC' as const;
export const CONTEXT_KEY_EMAIL_CATEGORY = 'EMAIL_CATEGORY' as const;
export const SETUP_STEP_WELCOME = 'welcome' as const;
export const SETUP_STEP_SCHEDULE = 'schedule' as const;
export const SETUP_STEP_LEARNING = 'learning' as const;
export const CONTEXT_ARCHIVE = 'archive' as const;
export const CONTEXT_MANUAL = 'manual' as const;
export const TAG_EMPTY_PARAGRAPH = '<p></p>' as const;
export const FIELD_JOB_TITLE = 'jobTitle' as const;
export const STRING_LOCALHOST = 'localhost' as const;

export const FONT_WEIGHT_NORMAL = 'normal' as const;
export const STRING_UPPERCASE = 'uppercase' as const;
export const LETTER_SPACING_WIDE = '0.06em' as const;
export const LETTER_SPACING_WIDER = '0.08em' as const;

export const PHISHING_CONFIDENCE_MEDIUM = 'medium' as const;
export const PHISHING_CONFIDENCE_HIGH = 'high' as const;

export const STRING_MD = 'md' as const;
export const STRING_ES = 'es' as const;
export const STRING_ES_ES = 'es-ES' as const;
export const STRING_SHORT = 'short' as const;
export const STRING_OPEN = 'open' as const;
export const STRING_WON = 'won' as const;
export const STRING_LOST = 'lost' as const;

export const STRING_STALE = 'stale' as const;

// Error type keys for context analysis
export const ERROR_TYPE_RATE_LIMIT = 'rate_limit' as const;
export const ERROR_TYPE_TIMEOUT = 'timeout' as const;
export const ERROR_TYPE_TOKEN_LIMIT = 'token_limit' as const;
export const ERROR_TYPE_PARSE_ERROR = 'parse_error' as const;
export const ERROR_TYPE_NETWORK_ERROR = 'network_error' as const;

// URL / API parameter names
export const PARAM_CATEGORY_IDS = 'categoryIds' as const;

// Built-in email category names
export const CATEGORY_NEWSLETTERS = 'Newsletters' as const;
export const CATEGORY_SALES = 'Sales' as const;
export const CATEGORY_PARTNERSHIPS = 'Partnerships' as const;
export const CATEGORY_CUSTOMER_SUPPORT = 'Customer Support' as const;
export const CATEGORY_HR_ADMIN = 'HR Admin' as const;

// ICS / calendar attachment
export const ICS_MIME_TYPE = 'text/calendar' as const;
export const ICS_STATUS_NEEDS_ACTION = 'NEEDS-ACTION' as const;
/** VCALENDAR METHOD meaning an attendee declined and proposed a new time. */
export const ICS_METHOD_COUNTER = 'COUNTER' as const;

// RSVP / Google Calendar response statuses
export const ICS_RSVP_ACCEPTED = 'accepted' as const;
export const ICS_RSVP_DECLINED = 'declined' as const;
export const ICS_RSVP_TENTATIVE = 'tentative' as const;
export const ICS_RSVP_NEEDS_ACTION_STATUS = 'needsAction' as const;

// Contact suggestion kind
export const SUGGESTION_KIND_GROUP = 'group' as const;

// Thread role
export const THREAD_ROLE_FROM = 'from' as const;

// Letter spacing
export const LETTER_SPACING_005EM = '0.05em' as const;

// Promise settlement status
export const PROMISE_STATUS_FULFILLED = 'fulfilled' as const;

// Search / enrichment status
export const STATUS_COMPLETE = 'complete' as const;

// Priority bucket label sentinel (the "All" bucket)
export const BUCKET_LABEL_ALL = 'All' as const;

// Q&A context tabs
export const QA_TAB_PENDING = 'pending' as const;
export const QA_TAB_APPROVED = 'approved' as const;

// Auth error types
export const AUTH_ERROR_OAUTH_ONLY = 'OAUTH_ONLY_ACCOUNT' as const;
export const AUTH_ERROR_ACCOUNT_DELETED = 'ACCOUNT_DELETED' as const;

// Environment values
export const ENV_PRODUCTION = 'production' as const;

// Role filter sentinel
export const FILTER_ROLE_ALL = 'all' as const;

// Waitlist signup response status (returned by POST /waitlist)
export const WAITLIST_STATUS_ALREADY_ON_LIST = 'already_on_waitlist' as const;
