# Unit Test Plan - High Risk Areas with Low Coverage

This document outlines a comprehensive unit test plan for server modules with critical business logic that currently lack test coverage.

## Priority Ranking (by Risk Level)

### 🔴 CRITICAL PRIORITY - Core Email Functionality

#### 1. **EmailThreadService** (`src/emails/email-thread.service.ts`)
**Risk Level: CRITICAL**
**Reason**: Core thread management, batch operations, race condition handling

**Test Cases Needed:**
- `getThreadEmails()` - Query builder optimization, field selection
- `getOrCreateEmailThread()` - Race condition handling, duplicate key errors (23505)
- `batchUpdateThreadStarCount()` - Bulk SQL updates, performance tracking
- `batchUpdateThreadArchivedStatuses()` - Transaction handling, batch updates
- `batchUpdateThreadStatus()` - Complex transaction logic, deleted thread handling
- `updateThreadArchivedStatus()` - Status change detection, thread creation fallback
- `getAllThreadsForSync()` - Sync comparison data retrieval
- Edge cases: empty arrays, null threadIds, concurrent updates

**Complexity**: Medium-High (complex batch operations, transactions, race conditions)

---

#### 2. **EmailsService** (`src/emails/emails.service.ts`)
**Risk Level: CRITICAL**
**Reason**: 3617 lines, core inbox logic, performance-critical queries, complex filtering

**Test Cases Needed:**
- `getInbox()` - Different modes (triage/action/follow-up), blocked sender filtering
- Email filtering logic - Priority scores, snooze status, batch status
- Performance tracking - Budget exceeded warnings
- Search functionality - Query building, ranking
- Email CRUD operations - Create, update, delete with encryption
- Error handling - Database errors, LLM failures, token refresh failures
- Edge cases: Empty inboxes, large result sets, malformed email data

**Complexity**: Very High (largest service file, many dependencies, performance-critical)

---

#### 3. **ContextService** (`src/context/context.service.ts`)
**Risk Level: HIGH**
**Reason**: Complex LLM integration, PII redaction, deduplication logic, 2800+ lines

**Test Cases Needed:**
- `redactPII()` - Name detection, email redaction, common word filtering
- `areContextValuesSimilar()` - Similarity matching (60% threshold), key phrase overlap
- `analyzeAndLearnFromEmails()` - Gmail API integration, batch processing, error recovery
- `deduplicateExistingContext()` - Consolidation logic, similarity detection
- `extractQAndAFromSentEmails()` - Q&A extraction, deduplication
- `createOrUpdateContext()` - Create/update logic, source tracking
- Edge cases: Empty email sets, API failures, malformed LLM responses, PII in various formats

**Complexity**: Very High (complex algorithms, external API dependencies, data transformation)

---

### 🟠 HIGH PRIORITY - Infrastructure & External Integrations

#### 4. **QueueMonitorService** (`src/queue/queue-monitor.service.ts`)
**Risk Level: HIGH**
**Reason**: Production monitoring, critical for detecting queue issues

**Test Cases Needed:**
- `collectMetrics()` - Queue state queries, error handling per queue
- `getQueueHealth()` - Health summary generation
- `trackJobStart()` / `trackJobComplete()` - Job tracking, processing time calculation
- `getProcessingTimeStats()` - Percentile calculations (p50, p95, p99)
- Edge cases: Missing queues, database connection errors, empty queue states
- Performance: High queue depths, concurrent metric collection

**Complexity**: Medium (SQL queries, statistics calculations)

---

#### 5. **EmailProviderManager** (`src/emails/email-provider-manager.service.ts`)
**Risk Level: HIGH**
**Reason**: Provider abstraction, critical for email sync

**Test Cases Needed:**
- `getProvider()` - Provider selection, connection checking
- `getPrimaryProvider()` - Priority ordering (Gmail first)
- `syncAllProviders()` - Multi-provider sync orchestration
- Error handling: Missing providers, connection failures
- Edge cases: No connected providers, provider unavailable

**Complexity**: Medium (Simple abstraction layer, but critical path)

---

#### 6. **GmailProvider** (`src/emails/providers/gmail.provider.ts`)
**Risk Level: HIGH**
**Reason**: 1559 lines, Gmail API integration, token refresh, email parsing

**Test Cases Needed:**
- `syncEmails()` - Token refresh logic, grace period handling, error recovery
- Email parsing - Payload extraction, header parsing, body decoding
- Rate limit handling - Exponential backoff, retry logic
- Token refresh events - OAuth token handling, error logging
- Edge cases: Invalid tokens, API errors, malformed email data, network failures

**Complexity**: High (External API, complex error handling, authentication)

---

#### 7. **GoogleAccountsService** (`src/google-accounts/google-accounts.service.ts`)
**Risk Level: MEDIUM-HIGH**
**Reason**: Authentication data management, token updates, primary account logic

**Test Cases Needed:**
- `create()` - Primary account switching, validation
- `updateTokens()` - Token updates, refresh token handling
- `setPrimary()` - Primary account switching, transaction safety
- `deactivate()` - Account deactivation, validation
- `findPrimary()` - Primary account retrieval
- Edge cases: Missing accounts, duplicate primary accounts, concurrent updates

**Complexity**: Medium (CRUD operations with business rules)

---

### 🟡 MEDIUM PRIORITY - Business Logic

#### 8. **FollowUpsService** (`src/follow-ups/follow-ups.service.ts`)
**Risk Level: MEDIUM-HIGH**
**Reason**: Follow-up generation, draft creation, business day calculations

**Test Cases Needed:**
- `createFollowUp()` - Follow-up creation, email thread association
- `generateFollowUpDrafts()` - LLM integration, draft generation, status updates
- `reviewAndCleanupDraft()` - Tone matching, greeting addition/removal
- `markAsReplied()` - Status transitions
- `calculateWaitingDuration()` - Business day calculations
- `isFromUser()` - Email source detection (SENT label, email comparison)
- Edge cases: Missing threads, LLM failures, invalid dates

**Complexity**: Medium-High (LLM integration, date calculations, complex business logic)

---

#### 9. **SummarizationService** (`src/summarization/summarization.service.ts`)
**Risk Level: MEDIUM**
**Reason**: LLM integration, fallback logic, thread summarization

**Test Cases Needed:**
- `summarizeEmail()` - Different rule types (bullet-points, action-items, custom)
- Thread summarization - Last 3 messages, cleaning logic
- `fallbackSummary()` - Fallback when LLM fails
- Provider selection (Gemini vs OpenAI)
- Edge cases: LLM failures, empty emails, very long emails, missing threads

**Complexity**: Medium (LLM integration with fallbacks)

---

#### 10. **CalendarService** (`src/calendar/calendar.service.ts`)
**Risk Level: MEDIUM**
**Reason**: Google Calendar integration, time slot calculation

**Test Cases Needed:**
- `getAvailableTimeSlots()` - Free slot calculation, busy period handling
- `calculateFreeSlots()` - Slot generation, business hours filtering
- `createEvent()` - Event creation, error handling
- `findEventsWithAttendee()` - Event filtering, date range handling
- `generateMeetingReply()` - LLM integration, slot formatting, fallback
- Edge cases: No available slots, API errors, invalid dates, missing calendar

**Complexity**: Medium (External API, date/time calculations)

---

#### 11. **ScanEmailService** (`src/emails/scan-email.service.ts`)
**Risk Level: MEDIUM**
**Reason**: Historical scan operations, simple but used in critical paths

**Test Cases Needed:**
- `createScanEmail()` - Scan email creation
- `findByMessageId()` - Message ID lookup
- `deleteAllForUser()` - Bulk deletion
- `countForUser()` - Count operations
- Edge cases: Duplicate message IDs, missing users

**Complexity**: Low (Simple CRUD operations)

---

#### 12. **OnboardingService** (`src/onboarding/onboarding.service.ts`)
**Risk Level: MEDIUM**
**Reason**: User onboarding, job queueing

**Test Cases Needed:**
- `startHistoricalScan()` - Job queueing, validation
- `getScanProgress()` - Progress tracking
- Error handling: Missing users, disconnected accounts
- Edge cases: Invalid user states, queue failures

**Complexity**: Low (Simple service, job queue integration)

---

### 🔵 LOWER PRIORITY - Processors & Background Jobs

#### 13. **EmailSyncProcessor** (`src/emails/email-sync.processor.ts`)
**Risk Level: MEDIUM**
**Reason**: Background job processor, concurrency management

**Test Cases Needed:**
- `onModuleInit()` - Worker registration, concurrency configuration
- Job processing - Error handling, retry logic
- Concurrency settings - CPU core detection, configuration
- Edge cases: Job failures, connection errors, high concurrency

**Complexity**: Medium-High (Background job processing, concurrency)

---

#### 14. **LLMProcessor** (`src/emails/llm-processor.ts`)
**Risk Level: MEDIUM**
**Reason**: Background LLM processing

**Test Cases Needed:**
- Job processing - LLM calls, error handling
- Queue management - Job priorities, retries
- Edge cases: LLM failures, rate limits, invalid data

**Complexity**: Medium (Background job processing with LLM)

---

## Testing Strategy Recommendations

### 1. **Start with EmailThreadService**
- Relatively isolated (few dependencies)
- Critical functionality
- Manageable complexity
- Good foundation for testing patterns

### 2. **Then ScanEmailService & GoogleAccountsService**
- Simple CRUD operations
- Build testing momentum
- Establish mocking patterns for repositories

### 3. **ContextService (High Priority but Complex)**
- Break into smaller testable units if possible
- Mock LLM service extensively
- Test algorithms separately (redactPII, similarity)

### 4. **EmailsService (Most Critical but Most Complex)**
- Consider refactoring large methods into smaller testable units
- Focus on critical paths first (getInbox, email creation)
- Mock all external dependencies heavily

### 5. **GmailProvider & QueueMonitorService**
- Mock external APIs (Gmail API, database)
- Test error handling extensively
- Test token refresh scenarios

## Test Coverage Goals

- **EmailThreadService**: 80%+ coverage
- **EmailsService**: 70%+ coverage (focus on critical paths)
- **ContextService**: 75%+ coverage
- **QueueMonitorService**: 85%+ coverage
- **Other services**: 80%+ coverage

## Common Testing Patterns Needed

1. **Repository Mocking** - TypeORM repository mocking
2. **External API Mocking** - Gmail API, LLM services
3. **Database Transaction Testing** - Transaction rollback scenarios
4. **Error Handling** - Network errors, API errors, database errors
5. **Concurrency Testing** - Race conditions, concurrent updates
6. **Performance Testing** - Large datasets, batch operations
7. **Date/Time Testing** - Business days, time zones, date calculations

## Notes

- Many services have circular dependencies (forwardRef) - will need careful mocking
- External dependencies (Gmail API, LLM) should be mocked comprehensively
- Database operations need repository mocking with TypeORM
- Background job processors (PgBoss) need queue mocking
- Encryption operations need helper mocking (EncryptionHelper)

## Estimated Effort

- **EmailThreadService**: 2-3 days
- **ScanEmailService**: 0.5 days
- **GoogleAccountsService**: 1 day
- **QueueMonitorService**: 1-2 days
- **EmailProviderManager**: 1 day
- **FollowUpsService**: 2 days
- **SummarizationService**: 1 day
- **CalendarService**: 1-2 days
- **OnboardingService**: 0.5 days
- **ContextService**: 3-4 days (complex)
- **EmailsService**: 5-7 days (very complex, may need refactoring)
- **GmailProvider**: 3-4 days
- **Processors**: 2-3 days each

**Total Estimated Effort**: 25-35 days



