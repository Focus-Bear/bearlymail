-- Analyze query performance
EXPLAIN ANALYZE
SELECT DISTINCT ON (email."emailThreadId") 
  email.id
FROM emails email
WHERE email."emailThreadId" = ANY(ARRAY[]::uuid[])
  AND email."userId" = '00000000-0000-0000-0000-000000000000'::uuid
ORDER BY email."emailThreadId", COALESCE(email."priorityScore", 50) DESC NULLS LAST, email."receivedAt" DESC;
