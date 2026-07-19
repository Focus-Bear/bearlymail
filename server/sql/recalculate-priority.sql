-- ============================================
-- SQL Queries to Recalculate Priority for Emails
-- ============================================
-- Run these in DBeaver to identify and fix threads needing priority calculation

-- 1. FIND THREADS THAT NEED PRIORITY RECALCULATION
-- This query finds threads that:
--   - Don't have a priorityExplanation
--   - Have isProcessingPriority stuck (older than 10 minutes)
--   - Have priorityExplanation with "Calculating..." items
-- ============================================

SELECT 
  et.id as thread_id,
  et."userId",
  et."threadId" as gmail_thread_id,
  et."isProcessingPriority",
  et."updatedAt",
  CASE 
    WHEN et."priorityExplanation" IS NULL THEN 'No explanation'
    WHEN et."isProcessingPriority" = true AND et."updatedAt" < NOW() - INTERVAL '10 minutes' THEN 'Stuck processing'
    ELSE 'Has explanation'
  END as status,
  COUNT(e.id) as email_count
FROM email_threads et
LEFT JOIN emails e ON e."emailThreadId" = et.id
WHERE 
  -- No priority explanation
  (et."priorityExplanation" IS NULL)
  OR 
  -- Stuck in processing (older than 10 minutes)
  (et."isProcessingPriority" = true AND et."updatedAt" < NOW() - INTERVAL '10 minutes')
  OR
  -- Has explanation but might have "Calculating..." items (we can't easily check encrypted JSON, so reset if processing)
  (et."isProcessingPriority" = true)
GROUP BY et.id, et."userId", et."threadId", et."isProcessingPriority", et."updatedAt", et."priorityExplanation"
ORDER BY et."updatedAt" ASC
LIMIT 100;

-- ============================================
-- 2. RESET isProcessingPriority FLAG
-- This resets the flag so jobs can be queued again
-- ============================================

-- Reset for ALL stuck threads (older than 10 minutes)
UPDATE email_threads
SET "isProcessingPriority" = false
WHERE 
  "isProcessingPriority" = true 
  AND "updatedAt" < NOW() - INTERVAL '10 minutes';

-- Or reset for a specific user (replace 'USER_ID_HERE' with actual user ID)
-- UPDATE email_threads
-- SET "isProcessingPriority" = false
-- WHERE 
--   "userId" = 'USER_ID_HERE'
--   AND "isProcessingPriority" = true 
--   AND "updatedAt" < NOW() - INTERVAL '10 minutes';

-- ============================================
-- 3. FIND THREADS WITH NO PRIORITY EXPLANATION
-- These definitely need calculation
-- ============================================

SELECT 
  et.id as thread_id,
  et."userId",
  et."threadId" as gmail_thread_id,
  COUNT(e.id) as email_count,
  MIN(e."receivedAt") as oldest_email_date
FROM email_threads et
LEFT JOIN emails e ON e."emailThreadId" = et.id
WHERE et."priorityExplanation" IS NULL
GROUP BY et.id, et."userId", et."threadId"
ORDER BY oldest_email_date ASC
LIMIT 100;

-- ============================================
-- 4. COUNT THREADS NEEDING RECALCULATION
-- Get a summary count
-- ============================================

SELECT 
  COUNT(*) FILTER (WHERE "priorityExplanation" IS NULL) as no_explanation,
  COUNT(*) FILTER (WHERE "isProcessingPriority" = true AND "updatedAt" < NOW() - INTERVAL '10 minutes') as stuck_processing,
  COUNT(*) FILTER (WHERE "isProcessingPriority" = true) as currently_processing,
  COUNT(*) as total_threads
FROM email_threads;

-- ============================================
-- 5. AFTER RESETTING FLAGS, QUEUE JOBS
-- ============================================
-- After running the UPDATE queries above, you have two options:
--
-- OPTION A: Use the API endpoint (recommended)
-- POST /emails/debug/fix-stuck-calculating
-- This will automatically requeue jobs for stuck threads
--
-- OPTION B: Manually queue jobs via SQL (advanced)
-- You'll need to insert into pgboss.job table with proper structure
-- This is more complex and not recommended unless you understand pg-boss internals
--
-- OPTION C: Wait for the system to automatically queue jobs
-- The system will queue jobs when emails are viewed or when the inbox is loaded
-- ============================================

