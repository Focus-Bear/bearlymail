# Database Performance Analysis Scripts

## Available Scripts

### 1. `check-indexes` - Verify and Create Missing Indexes
```bash
npm run check-indexes
```

**What it does:**
- Checks if all required performance indexes exist
- Creates missing indexes automatically
- Shows table statistics
- Runs EXPLAIN ANALYZE on the getInbox query

**Use when:**
- After running migrations
- When performance degrades
- To verify indexes were created correctly

### 2. `analyze-queries` - Analyze Slow Query Performance
```bash
npm run analyze-queries
```

**What it does:**
- Runs EXPLAIN ANALYZE on the slow queries from performance.log
- Shows execution plans and timing
- Checks index usage statistics
- Analyzes email distribution per thread
- Provides performance recommendations

**Use when:**
- Investigating performance issues
- After seeing slow queries in performance.log
- To understand query execution plans

## Performance Budgets

All endpoints now have performance budgets and log to `server/logs/performance.log`:

- **consent-status**: 200ms
- **batch-status**: 500ms
- **triage-suggestions**: 1000ms (with span breakdowns)
- **getInbox(triage)**: 500ms
- **getInbox(process)**: 1000ms

## Known Performance Issues

Based on `performance.log` analysis:

### 1. getInbox(triage) - 1662ms (3.3x over budget)
- **thread_query**: 551ms (5.5x over 100ms budget)
- **email_query**: 834ms (8.3x over 100ms budget)

**Root Cause**: Encryption/decryption overhead on encrypted columns (`from`, `fromName`, `subject`)

**Potential Solutions**:
- Cache decrypted values for frequently accessed emails
- Use raw queries for list views (skip TypeORM entity hydration)
- Consider materialized views for inbox data

### 2. triage-suggestions - 1122ms (122ms over budget)
- **context_query**: 273ms (173ms over 100ms budget) - despite index existing
- **history_query**: 565ms (265ms over 300ms budget)

**Root Cause**: 
- Encryption overhead on `contextValue` field
- Encryption overhead on email fields in history query

### 3. consent-status - 276ms (76ms over budget)
- Simple user lookup slightly over budget
- May need user table index optimization

## Index Status

✅ All required indexes exist:
- `IDX_user_contexts_userId`
- `IDX_user_contexts_userId_contextKey`
- `IDX_emails_userId_isBatched_batchReleaseAt`
- `IDX_emails_emailThreadId_priority_received`
- `IDX_email_threads_userId_triage`

## Next Steps

1. **Monitor performance.log** for patterns
2. **Run `analyze-queries`** when seeing slow queries
3. **Consider encryption caching** for frequently accessed data
4. **Use raw queries** for list views to skip entity hydration overhead

