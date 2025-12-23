-- Cleanup script for UUID migration
-- Removes invalid rows with NULL userId values

-- Clean up user_contexts
DELETE FROM user_contexts WHERE "userId" IS NULL;

-- Clean up priority_rules
DELETE FROM priority_rules WHERE "userId" IS NULL;

-- Clean up private_notes
DELETE FROM private_notes WHERE "userId" IS NULL;

-- Clean up emails
DELETE FROM emails WHERE "userId" IS NULL;

-- Clean up summarization_rules
DELETE FROM summarization_rules WHERE "userId" IS NULL;

-- If you want to drop and recreate tables with UUID columns (WARNING: This deletes all data)
-- Uncomment these lines:

-- DROP TABLE IF EXISTS user_contexts CASCADE;
-- DROP TABLE IF EXISTS priority_rules CASCADE;
-- DROP TABLE IF EXISTS private_notes CASCADE;
-- DROP TABLE IF EXISTS emails CASCADE;
-- DROP TABLE IF EXISTS summarization_rules CASCADE;
-- DROP TABLE IF EXISTS waitlist CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;










