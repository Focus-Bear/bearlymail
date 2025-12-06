# Quick Fix for UUID Migration Error

## The Problem
```
column "userId" of relation "user_contexts" contains null values
```

TypeORM can't convert integer columns with NULL values to UUID during synchronize.

## Quick Fix (Run This Now)

**Before restarting your server**, run this SQL to delete invalid rows:

```sql
-- Connect to your database first
-- Then run these commands:

DELETE FROM user_contexts WHERE "userId" IS NULL;
DELETE FROM priority_rules WHERE "userId" IS NULL;
DELETE FROM private_notes WHERE "userId" IS NULL;
DELETE FROM emails WHERE "userId" IS NULL;
DELETE FROM summarization_rules WHERE "userId" IS NULL;
```

### How to Run SQL

**Option 1: Using psql command line**
```bash
# Get your DB connection details from server/.env
# Then run:
psql -h <DB_HOST> -p <DB_PORT> -U <DB_USERNAME> -d <DB_NAME> -c "DELETE FROM user_contexts WHERE \"userId\" IS NULL; DELETE FROM priority_rules WHERE \"userId\" IS NULL; DELETE FROM private_notes WHERE \"userId\" IS NULL; DELETE FROM emails WHERE \"userId\" IS NULL; DELETE FROM summarization_rules WHERE \"userId\" IS NULL;"
```

**Option 2: Using a database GUI**
- Connect to your PostgreSQL database
- Run the DELETE statements above
- Restart your server

**Option 3: Use the cleanup script**
```bash
cd server/scripts
# Edit cleanup-null-userids.sql if needed, then:
psql -h <DB_HOST> -p <DB_PORT> -U <DB_USERNAME> -d <DB_NAME> -f cleanup-null-userids.sql
```

## After Cleanup

Once you've deleted the NULL rows, restart your NestJS server. TypeORM will:
1. ✅ Convert integer userId columns to UUID
2. ✅ Convert all ID columns to UUID  
3. ✅ Update foreign key relationships

The cleanup service will also run on startup to catch any remaining NULL values.

## Alternative: Drop Tables (Development Only)

If you're okay losing all data:

```sql
DROP TABLE IF EXISTS user_contexts CASCADE;
DROP TABLE IF EXISTS priority_rules CASCADE;
DROP TABLE IF EXISTS private_notes CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS summarization_rules CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

Then restart your server - TypeORM will create fresh tables with UUIDs.



