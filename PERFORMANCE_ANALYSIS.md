# Performance Analysis - December 2025

## Current Performance Issues

Based on `server/logs/performance.log`:

### 1. consent-status: 276ms (budget: 200ms) ❌
- **Exceeded by**: 76ms
- **Issue**: Simple user lookup taking too long
- **Possible causes**:
  - Missing index on `users.id` (should be primary key, but verify)
  - Database connection latency
  - Encryption/decryption overhead

### 2. getInbox(triage): 1662ms (budget: 500ms) ❌
- **Exceeded by**: 1162ms (3.3x over budget!)
- **Main bottlenecks**:
  - `thread_query`: 551ms (budget: 100ms) - **5.5x over budget**
  - `email_query`: 834ms (budget: 100ms) - **8.3x over budget**

**Query being run**:
```sql
WITH matching_threads AS (
  SELECT thread.id, thread."starCount", thread."isArchived"
  FROM email_threads thread
  WHERE thread."userId" = $1
    AND thread."isArchived" = false AND thread."starCount" = 0
  LIMIT 200
),
best_emails AS (
  SELECT DISTINCT ON (email."emailThreadId")
    email.id,
    email."emailThreadId",
    mt."starCount",
    mt."isArchived"
  FROM matching_threads mt
  INNER JOIN emails email ON email."emailThreadId" = mt.id
  WHERE email."userId" = $1
  ORDER BY email."emailThreadId", COALESCE(email."priorityScore", 50) DESC NULLS LAST, email."receivedAt" DESC
)
SELECT be.id as email_id, be."emailThreadId" as thread_id, be."starCount", be."isArchived"
FROM best_emails be
```

**Issues**:
- The CTE query might not be using indexes efficiently
- The `DISTINCT ON` with `ORDER BY` on multiple columns might be slow
- The join between `matching_threads` and `emails` might not be optimized

**Existing indexes**:
- `email_threads`: `@Index(['userId', 'isArchived', 'starCount'])` ✅
- `emails`: `@Index(['userId', 'emailThreadId'])` ✅
- `emails`: `@Index(['emailThreadId'])` ✅

**Potential fixes**:
1. Add composite index on `emails (emailThreadId, priorityScore DESC, receivedAt DESC)` for the DISTINCT ON query
2. Consider using a materialized view or caching for frequently accessed threads
3. Add index on `emails (userId, emailThreadId, priorityScore, receivedAt)` for better query planning

### 3. triage-suggestions: 1122ms (budget: 1000ms) ❌
- **Exceeded by**: 122ms
- **Bottlenecks**:
  - `email_query`: 282ms (budget: 200ms) - 82ms over
  - `context_query`: 273ms (budget: 100ms) - **173ms over** (index added but still slow!)
  - `history_query`: 565ms (budget: 300ms) - **265ms over**

**context_query issue**:
- We added `@Index(['userId'])` on `user_contexts` but it's still taking 273ms
- Possible causes:
  - Index not created yet (migration not run?)
  - Query is doing encryption/decryption of `contextValue` which is slow
  - Need to verify index exists: `SELECT indexname FROM pg_indexes WHERE tablename = 'user_contexts';`

**history_query issue**:
- Query: `SELECT ... FROM emails ... WHERE email.userId = :userId ORDER BY email.receivedAt DESC LIMIT 50`
- Taking 565ms - very slow for just 50 records
- Existing index: `@Index(['userId', 'receivedAt'])` ✅
- Possible causes:
  - Encryption/decryption overhead on `from`, `fromName`, `subject` fields
  - Index might not be optimal for this query pattern
  - Consider adding covering index or materialized view

## Recommendations

### Immediate Actions:
1. **Verify indexes exist**: Run `\d user_contexts` and `\d emails` in psql to confirm indexes
2. **Check EXPLAIN ANALYZE**: Run `EXPLAIN ANALYZE` on the slow queries to see execution plans
3. **Monitor encryption overhead**: The encryption/decryption might be the bottleneck

### Index Optimizations:
1. Add composite index for DISTINCT ON query in getInbox:
   ```sql
   CREATE INDEX "IDX_emails_emailThreadId_priority_received" 
   ON emails ("emailThreadId", "priorityScore" DESC NULLS LAST, "receivedAt" DESC);
   ```

2. Verify user_contexts index exists:
   ```sql
   SELECT indexname FROM pg_indexes WHERE tablename = 'user_contexts' AND indexname = 'IDX_user_contexts_userId';
   ```

3. Consider partial indexes for common queries:
   ```sql
   CREATE INDEX "IDX_email_threads_triage" 
   ON email_threads ("userId", "starCount") 
   WHERE "isArchived" = false AND "starCount" = 0;
   ```

### Query Optimizations:
1. Consider pagination for large result sets
2. Cache frequently accessed data (user contexts, thread metadata)
3. Use materialized views for complex aggregations
4. Consider async decryption or caching decrypted values

