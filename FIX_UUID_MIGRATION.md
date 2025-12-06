# Fix UUID Migration Error

## Error
```
column "userId" of relation "user_contexts" contains null values
```

This happens because existing database rows have NULL userId values, and TypeORM can't convert NULL integers to UUIDs.

## Quick Fix Options

### Option 1: Manual SQL Cleanup (Recommended)

Run this SQL to delete invalid rows:

```sql
-- Connect to your database
-- psql -h <host> -U <username> -d adhd_email_client

-- Delete rows with NULL userId
DELETE FROM user_contexts WHERE "userId" IS NULL;
DELETE FROM priority_rules WHERE "userId" IS NULL;
DELETE FROM private_notes WHERE "userId" IS NULL;
DELETE FROM emails WHERE "userId" IS NULL;
DELETE FROM summarization_rules WHERE "userId" IS NULL;
```

Then restart your server. TypeORM will be able to convert the column types.

### Option 2: Drop and Recreate Tables (Development Only - Deletes All Data)

If you're okay losing all data (development only):

```sql
-- Drop all tables (WARNING: This deletes all data!)
DROP TABLE IF EXISTS user_contexts CASCADE;
DROP TABLE IF EXISTS priority_rules CASCADE;
DROP TABLE IF EXISTS private_notes CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS summarization_rules CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

Then restart your server. TypeORM will create fresh tables with UUID columns.

### Option 3: Use the Cleanup Script

A cleanup script has been created at `server/scripts/cleanup-null-userids.sql`.

Run it with:
```bash
psql -h <host> -U <username> -d adhd_email_client -f server/scripts/cleanup-null-userids.sql
```

## After Cleanup

Once you've cleaned up the NULL values, restart your NestJS server. TypeORM's synchronize will:
1. Convert integer userId columns to UUID
2. Convert all ID columns to UUID
3. Update foreign key relationships

The cleanup service (`DatabaseCleanupService`) will run on startup and remove any remaining NULL values.

## Production Note

For production, you should:
1. Create a proper migration script
2. Test it on a staging database first
3. Back up your database before running migrations
4. Consider disabling `synchronize` and using TypeORM migrations instead



