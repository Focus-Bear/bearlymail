# Architecture Deep Dive

> Split out of [CLAUDE.md](CLAUDE.md) to keep the main reference lean. Covers server module organization and client architecture.
>
> For how a thread gets its category (rules → local model → LLM, plus proto-categories and all `categoryId` writers), see [docs/categorisation-pipeline.md](docs/categorisation-pipeline.md).

### Server Module Organization

The server follows NestJS module pattern. Each feature is a self-contained module with controller, service, and entity files.

```
server/src/
├── app.module.ts              # HTTP server module (imports all feature modules)
├── worker.module.ts           # Worker module (imports modules needed for background jobs)
├── main.ts                    # HTTP server entry point
├── worker.ts                  # Worker entry point (cluster mode, auto-respawns)
├── data-source.ts             # TypeORM data source config (used by migrations CLI)
│
├── auth/                      # Authentication (JWT, Google/Microsoft/Zoho OAuth)
├── users/                     # User management (CRUD, API keys, settings)
│
├── emails/                    # Core email module (largest module)
│   ├── emails.controller.ts   # 30+ REST endpoints under /emails
│   ├── emails.service.ts      # Core business logic (~3000 lines, delegates to sub-services)
│   ├── email-thread.service.ts # Thread-level operations
│   ├── email-crud.service.ts  # Basic CRUD operations
│   ├── email-search.service.ts # Search with LLM relevance scoring
│   ├── email-star.service.ts  # Star count management
│   ├── email-read.service.ts  # Read/unread status
│   ├── email-status.service.ts # Sync status tracking
│   ├── email-debug.service.ts # Debug utilities
│   ├── email-gmail.service.ts # Gmail-specific operations
│   ├── email-provider-manager.service.ts # Routes to correct provider
│   ├── email-sync.processor.ts # PgBoss job: email sync
│   ├── llm-processor.ts      # PgBoss jobs: priority, summary, GitHub extraction
│   ├── archive-email.processor.ts # PgBoss job: archive sync to provider
│   ├── scan-email.service.ts  # Historical email scanning
│   ├── performance-tracker.ts # Performance budget enforcement
│   ├── providers/
│   │   ├── gmail.provider.ts      # Gmail API implementation
│   │   ├── office365.provider.ts  # Microsoft Graph API implementation
│   │   └── zoho.provider.ts       # Zoho Mail API implementation
│   └── interfaces/
│       └── email-provider.interface.ts # Unified provider interface
│
├── context/                   # AI context learning (VIP contacts, projects, categories)
│   ├── context.service.ts     # Orchestrates multi-stage email analysis
│   ├── context-category.service.ts # Category management
│   ├── context-crud.service.ts # Context CRUD
│   ├── context-gmail-data.service.ts # Fetch Gmail data for analysis
│   ├── context-pii-redaction.service.ts # PII redaction before LLM
│   ├── context-qa-extraction.service.ts # Q&A pattern extraction
│   ├── context-analysis.processor.ts # PgBoss job: start analysis
│   ├── context-batch-analysis.processor.ts # PgBoss job: process email batch
│   ├── context-finalization.processor.ts # PgBoss job: finalize analysis
│   └── writing-style-learning.service.ts # Learn writing style from sent emails
│
├── llm/                       # LLM integration layer
│   ├── llm.service.ts         # Unified LLM interface (Gemini + OpenAI, fallback, retry)
│   ├── llm-core.service.ts    # Core text generation
│   ├── llm-operations.ts      # Operation type constants for token tracking
│   ├── llm.types.ts           # LLMProvider, LLMRequest types
│   ├── prompts.ts             # Prompt loading from .md files + Nunjucks rendering
│   ├── priority-analysis.service.ts # Priority scoring via LLM
│   ├── email-content-cleaner.ts # Clean email content before LLM
│   ├── token-usage.service.ts # Token usage tracking per operation
│   └── token-usage.controller.ts # Admin endpoint for usage stats
│
├── queue/                     # PgBoss job queue infrastructure
│   ├── queue.module.ts        # PgBoss provider setup
│   ├── job-priorities.ts      # Priority levels (HIGH=80, MEDIUM=40, LOW=20)
│   ├── queue-monitor.service.ts # Queue health monitoring
│   └── queue-autoscaling.service.ts # Dynamic worker scaling
│
├── database/
│   ├── entities/              # TypeORM entities (see Entity Reference in CLAUDE.md)
│   ├── migrations/            # Database migrations (timestamp-prefixed)
│   ├── typeorm-config.factory.ts # Shared TypeORM config
│   └── query-logger.ts        # Slow query logging
│
├── encryption/                # AES-256-GCM encryption helpers
├── priority/                  # Priority rule management
├── snooze/                    # Snooze/unsnooze logic
├── notes/                     # Private notes on threads
├── replies/                   # Reply draft generation
├── summarization/             # Email summarization
├── calendar/                  # Google Calendar integration
├── github/                    # GitHub PR/issue metadata extraction
├── contacts/                  # Contact sync and management
├── follow-ups/                # Follow-up draft generation and bulk send
├── auto-responder/            # Automated email responses
├── batch-schedule/            # Email batching schedule management
├── blocked-senders/           # Sender blocking
├── blocked-keywords/          # Keyword-based blocking
├── suggested-actions/         # AI-suggested actions for emails
├── suggested-replies/         # Pre-generated reply suggestions
├── drafts/                    # Draft management
├── subscriptions/             # RevenueCat subscription management
├── waitlist/                  # Waitlist management
├── onboarding/                # User onboarding flow
├── google-accounts/           # Google OAuth account management
├── office365-accounts/        # Microsoft OAuth account management
├── zoho-accounts/             # Zoho OAuth account management
├── proto-categories/          # Proto-category suggestions for "Other" emails
├── scheduling-preferences/    # User scheduling preferences
├── pusher/                    # Real-time push notifications
├── aws/                       # AWS services (CloudWatch metrics)
├── constants/                 # Shared constants (see Constants Reference in CLAUDE.md)
├── types/                     # Shared TypeScript types
├── utils/                     # Utility functions
└── scripts/                   # Utility scripts (seed, analysis, index checking)
```

### Client Architecture

```
client/src/
├── App.tsx                    # Root component, router setup
├── pages/                     # Top-level route components
│   ├── Inbox.tsx              # Main inbox page (uses useInboxState mega-hook)
│   ├── FocusedInbox.tsx       # Focused inbox variant
│   ├── EmailDetail.tsx        # Full-page email detail view
│   ├── Search.tsx             # Email search page
│   ├── Settings.tsx           # User settings page
│   ├── Compose.tsx            # Email composition page
│   ├── Contacts.tsx           # Contact management
│   ├── Stats.tsx              # Email analytics dashboard
│   ├── AdminDashboard.tsx     # Admin panel (token usage, user management)
│   ├── Landing.tsx            # Landing/marketing page
│   ├── Login.tsx              # Login page
│   └── ...
│
├── hooks/                     # Custom hooks (core logic lives here)
│   ├── useInboxState.ts       # MEGA-HOOK: orchestrates 22+ specialized hooks
│   ├── useEmailManagement.ts  # Email fetching and CRUD
│   ├── useEmailActions.ts     # Archive, star, snooze handlers
│   ├── useEmailActionsBase.ts # Base action implementations
│   ├── useBulkEmailActions.ts # Bulk operations with optimistic updates
│   ├── useEmailSelection.ts   # Multi-select state
│   ├── useEmailDetail.ts      # Email detail page state
│   ├── useEmailDetailReplies.ts # Reply composition + tone check
│   ├── useEmailDetailState.ts # Email detail sub-state
│   ├── useEmailDetailOperations.ts # Email detail API calls
│   ├── useEmailDetailActionItems.ts # Action items
│   ├── useEmailDetailNotes.ts # Private notes
│   ├── useEmailDetailGithub.ts # GitHub metadata display
│   ├── useEmailDetailToneCheck.ts # Tone check logic
│   ├── useEmailDetailInline.ts # Inline email view state
│   ├── useEmailFetching.ts    # Core email fetch logic
│   ├── useReplyDraftGeneration.ts # AI reply option generation
│   ├── useFollowUps.ts        # Follow-up mode data
│   ├── useFollowUpPolling.ts  # Poll for follow-up updates
│   ├── useTriageSuggestions.ts # AI triage suggestions
│   ├── useSplitView.ts        # Split view panel state
│   ├── useKeyboardShortcuts.ts # Global keyboard shortcuts
│   ├── useKeyboardHint.ts     # Keyboard shortcut hint display
│   ├── useInboxKeyboardNavigation.ts # Arrow key navigation
│   ├── useInboxInitialization.ts # Inbox setup and initialization
│   ├── useInboxModeChanges.ts # Mode switching logic
│   ├── useSearch.ts           # Search functionality
│   ├── useSnoozeInput.ts      # Snooze time parsing
│   ├── useStarCountHandler.ts # Star count change handling
│   ├── useBatchSchedule.ts    # Batch schedule display
│   ├── useTabCounts.ts        # Mode tab counts
│   ├── useModals.ts           # Modal dialog state
│   ├── useOnboarding.ts       # Onboarding wizard state
│   ├── useGitHubBatchFetch.ts # Batch GitHub status fetching
│   ├── useEmailProcessingPolling.ts # Poll for processing updates
│   ├── useEmailStats.ts       # Email analytics data
│   ├── useComposeForm.ts      # New email composition
│   ├── useContactSearch.ts    # Contact autocomplete
│   ├── useBlockSender.ts      # Sender blocking
│   ├── useAutoResponder.ts    # Auto-responder settings
│   ├── useAdminDashboard.ts   # Admin panel state
│   ├── useDebugPanel.ts       # Debug panel state
│   ├── usePriorityTooltip.ts  # Priority score tooltip
│   ├── useResponsiveBreakpoints.ts # Responsive layout breakpoints
│   ├── useUrgentNotification.ts # Urgent email notifications
│   ├── useSettingsData.ts     # Settings page data
│   ├── useEmailDetailFetching.ts # Email detail data fetching
│   ├── useEmailDetailInitialization.ts # Email detail setup
│   └── settings/              # Settings-specific hooks
│
├── components/                # Reusable UI components
│   ├── inbox/
│   │   ├── InboxContent.tsx   # Main email list renderer
│   │   ├── CategoryAccordion.tsx # Collapsible category groups
│   │   ├── SplitViewPanel.tsx # Side-by-side email view
│   │   ├── BulkOperationsBar.tsx # Batch action toolbar
│   │   └── ...
│   ├── email-detail/          # Email detail components
│   ├── email-detail-inline/   # Inline email viewer components
│   ├── priority/              # Priority display components
│   ├── compose/               # Email composition components
│   ├── search/                # Search components
│   ├── settings/              # Settings page components
│   ├── admin/                 # Admin dashboard components
│   ├── github/                # GitHub integration UI
│   ├── landing/               # Landing page components
│   ├── notifications/         # Toast notification system
│   └── ...
│
├── store/                     # Redux store
│   ├── store.ts               # Store configuration
│   ├── slices/
│   │   └── emailSlice.ts      # Email state (list, optimistic archives/snoozes)
│   └── selectors/             # Memoized selectors
│
├── contexts/                  # React contexts
│   └── AuthContext.tsx         # Authentication state (JWT, user, logout)
│
├── types/
│   └── email.ts               # Email, PriorityExplanation, InboxMode, TriageSuggestion types
│
├── constants/                 # String constants, mode names
├── config/                    # API configuration
├── locales/
│   ├── en.json                # English translations
│   └── es.json                # Spanish translations
├── theme/                     # Color scheme (ADHD-friendly, calming palette)
└── utils/
    ├── emailUtils.ts          # Email processing (sanitize HTML, parse addresses)
    └── emailBodyUtils.ts      # HTML body cleaning (remove cid: images, etc.)
```
