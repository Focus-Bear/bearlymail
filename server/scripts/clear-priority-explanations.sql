-- Script to clear all priority explanations from the emails table
-- This will force all emails to be recalculated with the new LLM-based priority system
-- Run this in your database client (e.g., DBeaver, psql)

-- Clear priorityExplanation column (stored as encrypted JSON)
UPDATE emails 
SET "priorityExplanation" = NULL,
    "isProcessingPriority" = false;

-- Optional: Also clear sentiment scores if you want them recalculated
-- UPDATE emails SET "sentimentScore" = NULL;

-- Verify the update
SELECT COUNT(*) as total_emails,
       COUNT("priorityExplanation") as emails_with_explanation,
       COUNT(*) - COUNT("priorityExplanation") as emails_without_explanation
FROM emails;



