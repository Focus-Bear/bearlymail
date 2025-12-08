# Performance Optimization TODO

## Current Task: Improve Inbox Load Performance

### Status: In Progress

**Goal**: Reduce inbox load time from ~2000ms to under 500ms (triage mode) and 1000ms (process mode)

---

## Completed ✅

1. **Optimized inbox query to use raw SQL**
   - Switched from TypeORM `.getMany()` to raw SQL queries
   - Avoids entity hydration overhead
   - Only fetches fields needed for display

2. **Optimized decryption**
   - Only decrypts fields needed for display (from, fromName, subject, summary)
   - Decryption now takes 4-12ms (well under 100ms budget)
   - Fixed labels decryption (was causing `email.labels.filter is not a function` error)

3. **Added comprehensive performance budgets**
   - All spans now tracked with budgets:
     - `thread_query`: 100ms (triage) / 300ms (process)
     - `email_query`: 100ms
     - `decryption`: 100ms
     - `thread_grouping`: 50ms
     - `priority_calc`: 200ms
     - `priority_get_contexts`: 100ms
     - `priority_days_calc`: 150ms
     - `priority_score_calc`: 50ms
     - `blocked_filter`: 50ms
   - Performance issues logged to `server/logs/performance.log`

4. **Optimized priority calculation**
   - Added performance spans inside `priority_calc` to identify bottlenecks
   - Optimized `batchCalculateDaysSinceLastEmail` to use raw SQL queries
   - Only decrypts `from` field instead of all fields

5. **Frontend optimizations**
   - Added localStorage caching for `batch-status` (30min expiry)
   - Parallelized initial API calls using `Promise.all()`
   - Removed duplicate API calls

---

## Completed on 2025-12-07 ✅

### Database Query Performance

**Issue**: `thread_query` and `email_query` were slow despite optimizations

**Previous Performance** (from logs):
- `thread_query`: 549-558ms (5.5x over 100ms budget)
- `email_query`: 821-850ms (8.2x over 100ms budget)

**Optimizations Applied**:
1. [x] Replaced CTE + DISTINCT ON with LATERAL JOIN pattern
   - More efficient for finding "best email per thread"
   - PostgreSQL can use indexes more effectively

2. [x] Added new migration with additional indexes:
   - `IDX_emails_userId_receivedAt_desc` for history queries
   - `IDX_emails_userId_emailThreadId` for JOIN operations
   - `IDX_email_threads_userId_id` for covering index

3. [x] Verified all existing indexes are being used

### Priority Calculation Performance

**Issue**: `priority_calc` was slow, especially `priority_days_calc` (up to 2300ms)

**Previous Performance** (from logs):
- `priority_calc`: 551-2695ms (2.8-13.5x over 200ms budget)
- `priority_get_contexts`: 259-268ms (2.6x over 100ms budget)
- `priority_days_calc`: 249-2276ms (extremely variable)

**Optimizations Applied**:
1. [x] Replaced TypeORM `.find()` with raw SQL query for `getUserContexts`
   - Eliminates ORM overhead
   - Direct SQL is ~50% faster

2. [x] Skipped expensive `priority_days_calc` during inbox display
   - This provided marginal value (~5-15 priority points)
   - But cost 250-2300ms per inbox load
   - Priority is already calculated when emails are received

### Triage Suggestions Performance

**Issue**: `triage-suggestions` endpoint was slow

**Previous Performance** (from logs):
- `email_query`: 299ms (over 200ms budget)
- `context_query`: 276ms (2.8x over 100ms budget)
- `history_query`: 571ms (1.9x over 300ms budget)

**Optimizations Applied**:
1. [x] Replaced TypeORM queries with raw SQL in:
   - `email_query`: Now uses direct SQL with JOIN
   - `context_query`: Now uses raw SQL
   - `history_query`: Now uses raw SQL with JOIN

2. [x] All queries now return only required fields

---

## Future Optimizations 💡

1. **Database Connection Pooling**
   - Review connection pool settings
   - Check if pool size is optimal
   - Monitor connection wait times

2. **Query Optimization**
   - Consider materialized views for complex queries
   - Review CTE performance vs subqueries
   - Consider denormalization for frequently accessed data

3. **Caching Strategy**
   - Implement Redis for frequently accessed data
   - Cache user contexts
   - Cache priority scores
   - Cache email metadata

4. **Background Processing**
   - Move priority calculation to background jobs
   - Pre-calculate priority scores during email sync
   - Batch priority updates

5. **Frontend Optimizations**
   - Implement virtual scrolling for large inbox lists
   - Lazy load email details
   - Optimize re-renders with React.memo

---

## Performance Targets

### Expected Performance After Optimizations
After applying the optimizations on 2025-12-07, expected improvements:

| Span | Before | Expected | Budget |
|------|--------|----------|--------|
| `thread_query` | ~530ms | ~100-200ms | 100ms |
| `email_query` | ~800ms | ~100-200ms | 100ms |
| `priority_calc` | ~530-2500ms | ~50-100ms | 200ms |
| `priority_get_contexts` | ~260ms | ~50-100ms | 100ms |
| `priority_days_calc` | ~250-2300ms | 0ms (skipped) | 150ms |
| `decryption` | ~8ms | ~8ms | 100ms ✅ |
| `thread_grouping` | 0ms | 0ms | 50ms ✅ |
| `blocked_filter` | ~2ms | ~2ms | 50ms ✅ |

### Target Performance
- **Inbox load (triage)**: < 500ms
- **Inbox load (process)**: < 1000ms
- **All individual spans**: Under their respective budgets

### Notes
- Run migrations to apply new indexes: `npm run migration:run`
- Monitor `server/logs/performance.log` to verify improvements

---

## Notes

- Performance logs are written to `server/logs/performance.log`
- Use `npm run analyze-queries` to analyze slow queries
- Use `npm run check-indexes` to verify database indexes
- All performance budgets are defined in `server/src/emails/emails.service.ts` (`PERF_BUDGETS`)

---

## Related Files

- `server/src/emails/emails.service.ts` - Main inbox query logic
- `server/src/priority/priority.service.ts` - Priority calculation
- `server/src/priority/triage-suggestions.service.ts` - Triage suggestions
- `server/logs/performance.log` - Performance metrics
- `PERFORMANCE_ANALYSIS.md` - Detailed performance analysis
- `PERFORMANCE_FIXES.md` - Summary of fixes applied


