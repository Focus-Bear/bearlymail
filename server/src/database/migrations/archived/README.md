# Archived Migrations

These migrations have been consolidated into `1735271999999-InitialSchema.ts`.

**Date:** December 14, 2025

**Reason:** Database was reset and all migrations were flattened into a single initial schema migration for simplicity.

All tables, indexes, and enum values from these migrations are now included in the consolidated `InitialSchema` migration.

## Archived Migrations

- `1735272000000-AddEmailPerformanceIndexes.ts` - Indexes now in InitialSchema
- `1735272000002-AddActionItemsAndToneSettings.ts` - action_items table now in InitialSchema
- `1735272000003-AddContextPriorityAndNewKeys.ts` - priority column and enum values now in InitialSchema
- `1735272000004-DropPriorityRulesTable.ts` - No longer needed (table never created in InitialSchema)
- `1735272000005-AddBatchScheduleAndFollowUps.ts` - Tables now in InitialSchema
- `1735400000000-CreateEmailThreadsTable.ts` - Table now in InitialSchema
- `1735500000000-CreateContactsTable.ts` - Table now in InitialSchema
- `1735500000001-AddEmailThreadIdIndex.ts` - Indexes now in InitialSchema
- `1735500000002-CreateBlockedSendersTable.ts` - Table now in InitialSchema
- `1735600000000-AddMissingContextEnumValues.ts` - Enum values now in InitialSchema
- `1735700000000-EnsureContextEnumValues.ts` - Enum values now in InitialSchema
- `1735800000000-AddExplanationToUserContext.ts` - Column now in InitialSchema
- `1735900000000-EnsureAllContextEnumValues.ts` - Enum values now in InitialSchema
- `1736000000000-OptimizeInboxQueries.ts` - Indexes now in InitialSchema
- `1736100000000-AnalyzeTables.ts` - ANALYZE statements now in InitialSchema
- `1736200000000-AddQAndAContextEnum.ts` - Enum value now in InitialSchema
- `1736400000000-AddPerformanceIndexes.ts` - Indexes now in InitialSchema
- `1736500000000-AddAdditionalPerformanceIndexes.ts` - Indexes now in InitialSchema

