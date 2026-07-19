import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";
import { getErrorMessage } from "../../types/common";

export class InitialSchema1735271999999 implements MigrationInterface {
  name = "InitialSchema1735271999999";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create extension for UUID generation
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ============================================
    // CREATE ALL TABLES
    // ============================================

    // 1. Create users table first (referenced by other tables)
    const usersTableExists = await queryRunner.hasTable("users");
    if (!usersTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "users",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            {
              name: "emailHash",
              type: "varchar",
              length: "64",
              isUnique: true,
            },
            { name: "email", type: "text" },
            { name: "password", type: "varchar", isNullable: true },
            { name: "passwordSetupToken", type: "varchar", isNullable: true },
            {
              name: "passwordSetupTokenExpiresAt",
              type: "timestamp",
              isNullable: true,
            },
            { name: "googleId", type: "varchar", isNullable: true },
            { name: "name", type: "text", isNullable: true },
            {
              name: "googleCalendarAccessToken",
              type: "text",
              isNullable: true,
            },
            {
              name: "googleCalendarRefreshToken",
              type: "text",
              isNullable: true,
            },
            { name: "batchDeliveryHours", type: "integer", default: 6 },
            { name: "needsRelogin", type: "boolean", default: false },
            { name: "hasSeenTour", type: "boolean", default: false },
            { name: "hasScannedHistory", type: "boolean", default: false },
            { name: "scanProgress", type: "integer", isNullable: true },
            { name: "scanTotal", type: "integer", isNullable: true },
            { name: "isAdmin", type: "boolean", default: false },
            { name: "isApproved", type: "boolean", default: false },
            { name: "termsAcceptedAt", type: "timestamp", isNullable: true },
            { name: "privacyAcceptedAt", type: "timestamp", isNullable: true },
            { name: "termsVersion", type: "varchar", isNullable: true },
            { name: "privacyVersion", type: "varchar", isNullable: true },
            { name: "openAiApiKey", type: "text", isNullable: true },
            { name: "revenueCatUserId", type: "varchar", isNullable: true },
            { name: "subscriptionStatus", type: "varchar", isNullable: true },
            {
              name: "subscriptionExpiresAt",
              type: "timestamp",
              isNullable: true,
            },
            { name: "trialStartedAt", type: "timestamp", isNullable: true },
            { name: "toneSettings", type: "text", isNullable: true },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        "users",
        new TableIndex({
          name: "IDX_users_emailHash",
          columnNames: ["emailHash"],
        }),
      );
    }

    // 2. Create google_accounts table
    const googleAccountsTableExists =
      await queryRunner.hasTable("google_accounts");
    if (!googleAccountsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "google_accounts",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "googleId", type: "varchar" },
            { name: "email", type: "text" },
            { name: "name", type: "varchar", isNullable: true },
            { name: "accessToken", type: "text" },
            { name: "refreshToken", type: "text" },
            { name: "isActive", type: "boolean", default: true },
            { name: "isPrimary", type: "boolean", default: true },
            { name: "needsRelogin", type: "boolean", default: false },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        "google_accounts",
        new TableIndex({
          name: "IDX_google_accounts_userId",
          columnNames: ["userId"],
        }),
      );
      await queryRunner.createIndex(
        "google_accounts",
        new TableIndex({
          name: "IDX_google_accounts_googleId",
          columnNames: ["googleId"],
        }),
      );
    }

    // 3. Create email_threads table
    const emailThreadsTableExists = await queryRunner.hasTable("email_threads");
    if (!emailThreadsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "email_threads",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "threadId", type: "varchar" },
            { name: "starCount", type: "integer", default: 0 },
            { name: "isArchived", type: "boolean", default: false },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    }

    // 4. Create emails table
    const emailsTableExists = await queryRunner.hasTable("emails");
    if (!emailsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "emails",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "threadId", type: "varchar" },
            { name: "emailThreadId", type: "uuid", isNullable: true },
            { name: "messageId", type: "varchar" },
            { name: "from", type: "text" },
            { name: "fromName", type: "text", isNullable: true },
            { name: "senderJobTitle", type: "text", isNullable: true },
            { name: "subject", type: "text" },
            { name: "body", type: "text" },
            { name: "htmlBody", type: "text", isNullable: true },
            { name: "priorityScore", type: "double precision", default: 50 },
            { name: "isUrgent", type: "boolean", default: false },
            { name: "isSnoozed", type: "boolean", default: false },
            { name: "snoozeUntil", type: "timestamp", isNullable: true },
            { name: "isBatched", type: "boolean", default: false },
            { name: "batchReleaseAt", type: "timestamp", isNullable: true },
            {
              name: "sentimentScore",
              type: "double precision",
              isNullable: true,
            },
            { name: "timeToReply", type: "integer", isNullable: true },
            { name: "isRead", type: "boolean", default: false },
            { name: "summary", type: "text", isNullable: true },
            { name: "labels", type: "text", isNullable: true },
            { name: "isProcessingPriority", type: "boolean", default: false },
            { name: "isProcessingSummary", type: "boolean", default: false },
            { name: "receivedAt", type: "timestamp" },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            { name: "priorityExplanation", type: "text", isNullable: true },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
            {
              columnNames: ["emailThreadId"],
              referencedTableName: "email_threads",
              referencedColumnNames: ["id"],
              onDelete: "SET NULL",
            },
          ],
        }),
        true,
      );
    } else {
      // Table exists, but check if missing columns need to be added
      const emailsTable = await queryRunner.getTable("emails");
      if (emailsTable) {
        const hasIsProcessingPriority = emailsTable.findColumnByName(
          "isProcessingPriority",
        );
        const hasIsProcessingSummary = emailsTable.findColumnByName(
          "isProcessingSummary",
        );

        if (!hasIsProcessingPriority) {
          await queryRunner.addColumn(
            "emails",
            new TableColumn({
              name: "isProcessingPriority",
              type: "boolean",
              default: false,
            }),
          );
        }

        if (!hasIsProcessingSummary) {
          await queryRunner.addColumn(
            "emails",
            new TableColumn({
              name: "isProcessingSummary",
              type: "boolean",
              default: false,
            }),
          );
        }
      }
    }

    // 5. Create user_contexts table with enums
    const userContextsTableExists = await queryRunner.hasTable("user_contexts");
    if (!userContextsTableExists) {
      await queryRunner.query(`
        CREATE TYPE "user_contexts_contextkey_enum" AS ENUM(
          'VIP_CONTACT', 'MY_GOALS', 'DONT_CARE', 'WORKING_ON', 'USER_INFO',
          'URGENT', 'NOT_IMPORTANT', 'Q_AND_A', 'PROJECT_NAME', 'COLLEAGUE_NAME',
          'CURRENT_TOPIC', 'WRITING_STYLE_TONE', 'COMMON_PHRASE', 'AVERAGE_REPLY_TIME', 'OTHER'
        )
      `);

      await queryRunner.query(`
        CREATE TYPE "user_contexts_source_enum" AS ENUM('AUTOGENERATED', 'USER_EDITED')
      `);

      await queryRunner.createTable(
        new Table({
          name: "user_contexts",
          columns: [
            {
              name: "contextId",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "contextKey", type: "user_contexts_contextkey_enum" },
            { name: "contextValue", type: "text" },
            { name: "priority", type: "integer", isNullable: true },
            {
              name: "source",
              type: "user_contexts_source_enum",
              default: "'AUTOGENERATED'",
            },
            { name: "explanation", type: "text", isNullable: true },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "lastModified",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
              onUpdate: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    } else {
      // Table exists, check if lastModified column needs to be added or renamed from updatedAt
      const userContextsTable = await queryRunner.getTable("user_contexts");
      if (userContextsTable) {
        const hasLastModified =
          userContextsTable.findColumnByName("lastModified");
        const hasUpdatedAt = userContextsTable.findColumnByName("updatedAt");
        if (!hasLastModified) {
          if (hasUpdatedAt) {
            // Rename updatedAt to lastModified
            await queryRunner.query(`
              ALTER TABLE "user_contexts" 
              RENAME COLUMN "updatedAt" TO "lastModified"
            `);
          } else {
            // Add lastModified column
            await queryRunner.addColumn(
              "user_contexts",
              new TableColumn({
                name: "lastModified",
                type: "timestamp",
                default: "CURRENT_TIMESTAMP",
                onUpdate: "CURRENT_TIMESTAMP",
              }),
            );
          }
        }
      }
    }

    // 6. Create action_items table
    const actionItemsTableExists = await queryRunner.hasTable("action_items");
    if (!actionItemsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "action_items",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "emailId", type: "uuid", isNullable: true },
            { name: "emailThreadId", type: "varchar", isNullable: true },
            { name: "description", type: "text" },
            { name: "isCompleted", type: "boolean", default: false },
            { name: "source", type: "text", default: "'user'" },
            {
              name: "confidenceScore",
              type: "double precision",
              isNullable: true,
            },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
            {
              columnNames: ["emailId"],
              referencedTableName: "emails",
              referencedColumnNames: ["id"],
              onDelete: "SET NULL",
            },
          ],
        }),
        true,
      );
    }

    // 7. Create batch_schedules table
    const batchSchedulesTableExists =
      await queryRunner.hasTable("batch_schedules");
    if (!batchSchedulesTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "batch_schedules",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "deliveryDays", type: "text" },
            { name: "deliveryTimes", type: "text" },
            { name: "isEnabled", type: "boolean", default: true },
            { name: "timezone", type: "varchar", default: "'UTC'" },
            { name: "urgentBypassSchedule", type: "boolean", default: true },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    }

    // 8. Create follow_ups table
    const followUpsTableExists = await queryRunner.hasTable("follow_ups");
    if (!followUpsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "follow_ups",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "threadId", type: "varchar" },
            { name: "emailThreadId", type: "uuid", isNullable: true },
            { name: "sentEmailId", type: "varchar", isNullable: true },
            { name: "status", type: "varchar", default: "'awaiting_reply'" },
            { name: "followUpDueAt", type: "timestamp" },
            { name: "followUpDays", type: "integer" },
            { name: "lastTheirReply", type: "text", isNullable: true },
            { name: "lastTheirReplyFrom", type: "text", isNullable: true },
            { name: "lastTheirReplyAt", type: "timestamp", isNullable: true },
            { name: "lastMyReply", type: "text", isNullable: true },
            { name: "lastMyReplyAt", type: "timestamp", isNullable: true },
            { name: "draftFollowUp", type: "text", isNullable: true },
            { name: "subject", type: "text", isNullable: true },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
            {
              columnNames: ["emailThreadId"],
              referencedTableName: "email_threads",
              referencedColumnNames: ["id"],
              onDelete: "SET NULL",
            },
          ],
        }),
        true,
      );
    }

    // 9. Create contacts table
    const contactsTableExists = await queryRunner.hasTable("contacts");
    if (!contactsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "contacts",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "provider", type: "varchar", default: "'manual'" },
            { name: "providerId", type: "varchar", isNullable: true },
            { name: "email", type: "text" },
            { name: "name", type: "text", isNullable: true },
            { name: "firstName", type: "text", isNullable: true },
            { name: "lastName", type: "text", isNullable: true },
            { name: "phone", type: "text", isNullable: true },
            { name: "company", type: "text", isNullable: true },
            { name: "jobTitle", type: "text", isNullable: true },
            { name: "photoUrl", type: "text", isNullable: true },
            { name: "emailHash", type: "varchar", length: "64" },
            { name: "searchTokens", type: "text", isNullable: true },
            { name: "isFavorite", type: "boolean", default: false },
            { name: "lastContactedAt", type: "timestamp", isNullable: true },
            { name: "contactFrequency", type: "integer", default: 0 },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            { name: "lastSyncedAt", type: "timestamp", isNullable: true },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    }

    // 10. Create blocked_senders table
    const blockedSendersTableExists =
      await queryRunner.hasTable("blocked_senders");
    if (!blockedSendersTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "blocked_senders",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "email", type: "text" },
            { name: "emailHash", type: "varchar", length: "64" },
            {
              name: "domainHash",
              type: "varchar",
              length: "64",
              isNullable: true,
            },
            { name: "reason", type: "text", isNullable: true },
            { name: "senderName", type: "text", isNullable: true },
            {
              name: "blockedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    }

    // 11. Create waitlist table
    const waitlistTableExists = await queryRunner.hasTable("waitlist");
    if (!waitlistTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "waitlist",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            {
              name: "emailHash",
              type: "varchar",
              length: "64",
              isUnique: true,
            },
            { name: "email", type: "text" },
            { name: "firstName", type: "text" },
            { name: "reason", type: "text" },
            { name: "approved", type: "boolean", default: false },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
        }),
        true,
      );
    }

    // 12. Create private_notes table
    const privateNotesTableExists = await queryRunner.hasTable("private_notes");
    if (!privateNotesTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "private_notes",
          columns: [
            {
              name: "noteId",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "emailThreadId", type: "varchar" },
            { name: "content", type: "text" },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    }

    // 13. Create summarization_rules table
    const summarizationRulesTableExists = await queryRunner.hasTable(
      "summarization_rules",
    );
    if (!summarizationRulesTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "summarization_rules",
          columns: [
            {
              name: "ruleId",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "whenToUse", type: "text" },
            { name: "howToSummarize", type: "text" },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );
    }

    // 14. Create scan_emails table
    const scanEmailsTableExists = await queryRunner.hasTable("scan_emails");
    if (!scanEmailsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "scan_emails",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "threadId", type: "varchar" },
            { name: "messageId", type: "varchar" },
            { name: "from", type: "text" },
            { name: "fromName", type: "text", isNullable: true },
            { name: "senderJobTitle", type: "text", isNullable: true },
            { name: "subject", type: "text" },
            { name: "body", type: "text" },
            { name: "htmlBody", type: "text", isNullable: true },
            { name: "starCount", type: "integer", default: 0 },
            { name: "receivedAt", type: "timestamp" },
            { name: "isRead", type: "boolean", default: false },
            { name: "timeToReply", type: "integer", isNullable: true },
            { name: "isArchived", type: "boolean", default: false },
            { name: "archivedAt", type: "timestamp", isNullable: true },
            { name: "wasRepliedTo", type: "boolean", default: false },
          ],
        }),
        true,
      );
    }

    // ============================================
    // CREATE ALL INDEXES
    // ============================================

    // Email threads indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "email_threads",
      new TableIndex({
        name: "IDX_email_threads_userId_threadId",
        columnNames: ["userId", "threadId"],
        isUnique: true,
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "email_threads",
      new TableIndex({
        name: "IDX_email_threads_userId_starCount_isArchived",
        columnNames: ["userId", "starCount", "isArchived"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "email_threads",
      new TableIndex({
        name: "IDX_email_threads_userId_isArchived_starCount",
        columnNames: ["userId", "isArchived", "starCount"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "email_threads",
      new TableIndex({
        name: "IDX_email_threads_userId_id",
        columnNames: ["userId", "id"],
      }),
    );

    // Partial indexes for email_threads
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_email_threads_userId_starCount_process') THEN
          CREATE INDEX "IDX_email_threads_userId_starCount_process"
          ON "email_threads" ("userId", "starCount")
          WHERE "starCount" > 0;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_email_threads_userId_triage') THEN
          CREATE INDEX "IDX_email_threads_userId_triage"
          ON "email_threads" ("userId", "starCount")
          WHERE "isArchived" = false AND "starCount" = 0;
        END IF;
      END $$;
    `);

    // Emails indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_priorityScore",
        columnNames: ["userId", "priorityScore"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_threadId",
        columnNames: ["userId", "threadId"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_messageId",
        columnNames: ["userId", "messageId"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_receivedAt",
        columnNames: ["userId", "receivedAt"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_threadId",
        columnNames: ["threadId"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_emailThreadId",
        columnNames: ["userId", "emailThreadId"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_emailThreadId",
        columnNames: ["emailThreadId"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_isBatched_batchReleaseAt",
        columnNames: ["userId", "isBatched", "batchReleaseAt"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_isSnoozed",
        columnNames: ["userId", "isSnoozed"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "emails",
      new TableIndex({
        name: "IDX_emails_userId_isSnoozed_isBatched",
        columnNames: ["userId", "isSnoozed", "isBatched"],
      }),
    );

    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_emails_emailThreadId_priority_received') THEN
          CREATE INDEX "IDX_emails_emailThreadId_priority_received"
          ON "emails" ("emailThreadId", "priorityScore" DESC NULLS LAST, "receivedAt" DESC);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_emails_userId_receivedAt_desc') THEN
          CREATE INDEX "IDX_emails_userId_receivedAt_desc"
          ON "emails" ("userId", "receivedAt" DESC);
        END IF;
      END $$;
    `);

    // User contexts indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "user_contexts",
      new TableIndex({
        name: "IDX_user_contexts_userId",
        columnNames: ["userId"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "user_contexts",
      new TableIndex({
        name: "IDX_user_contexts_userId_contextKey",
        columnNames: ["userId", "contextKey"],
      }),
    );

    // Action items indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "action_items",
      new TableIndex({
        name: "IDX_action_items_user_completed",
        columnNames: ["userId", "isCompleted"],
      }),
    );

    // Batch schedules indexes
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_batch_schedules_userId') THEN
          CREATE UNIQUE INDEX "IDX_batch_schedules_userId"
          ON "batch_schedules" ("userId");
        END IF;
      END $$;
    `);

    // Follow ups indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "follow_ups",
      new TableIndex({
        name: "IDX_follow_ups_user_status",
        columnNames: ["userId", "status"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "follow_ups",
      new TableIndex({
        name: "IDX_follow_ups_user_due",
        columnNames: ["userId", "followUpDueAt"],
      }),
    );

    // Contacts indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "contacts",
      new TableIndex({
        name: "IDX_contacts_userId_emailHash",
        columnNames: ["userId", "emailHash"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "contacts",
      new TableIndex({
        name: "IDX_contacts_userId_provider_providerId",
        columnNames: ["userId", "provider", "providerId"],
        isUnique: true,
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "contacts",
      new TableIndex({
        name: "IDX_contacts_emailHash",
        columnNames: ["emailHash"],
      }),
    );

    // Blocked senders indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "blocked_senders",
      new TableIndex({
        name: "IDX_blocked_senders_userId_emailHash",
        columnNames: ["userId", "emailHash"],
        isUnique: true,
      }),
    );

    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_blocked_senders_userId_domainHash') THEN
          CREATE INDEX "IDX_blocked_senders_userId_domainHash"
          ON "blocked_senders" ("userId", "domainHash")
          WHERE "domainHash" IS NOT NULL;
        END IF;
      END $$;
    `);

    // Waitlist indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "waitlist",
      new TableIndex({
        name: "IDX_waitlist_emailHash",
        columnNames: ["emailHash"],
      }),
    );

    // Scan emails indexes
    await this.createIndexIfNotExists(
      queryRunner,
      "scan_emails",
      new TableIndex({
        name: "IDX_scan_emails_userId_receivedAt",
        columnNames: ["userId", "receivedAt"],
      }),
    );

    await this.createIndexIfNotExists(
      queryRunner,
      "scan_emails",
      new TableIndex({
        name: "IDX_scan_emails_userId_messageId",
        columnNames: ["userId", "messageId"],
      }),
    );

    // ============================================
    // ANALYZE TABLES FOR QUERY PLANNER
    // ============================================
    await queryRunner.query(`ANALYZE "email_threads"`);
    await queryRunner.query(`ANALYZE "emails"`);
    await queryRunner.query(`ANALYZE "user_contexts"`);
    await queryRunner.query(`ANALYZE "blocked_senders"`);
    await queryRunner.query(`ANALYZE "batch_schedules"`);

    console.log(
      "Initial schema created successfully with all tables and indexes",
    );
  }

  private async createIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    index: TableIndex,
  ): Promise<void> {
    // Check if index already exists before trying to create it
    const indexExists = await queryRunner.query(
      `
      SELECT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = $1
      )
    `,
      [index.name],
    );

    if (indexExists && indexExists[0] && indexExists[0].exists) {
      // Index already exists, skip creation
      return;
    }

    // Index doesn't exist, create it
    try {
      await queryRunner.createIndex(tableName, index);
    } catch (error: unknown) {
      // Double-check: if it was created by another process between check and create
      const errorMessage = getErrorMessage(error);
      if (
        errorMessage?.includes("already exists") ||
        errorMessage?.includes("duplicate")
      ) {
        // Index exists now, that's fine
        return;
      }
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse dependency order
    const tables = [
      "scan_emails",
      "summarization_rules",
      "private_notes",
      "waitlist",
      "blocked_senders",
      "contacts",
      "follow_ups",
      "batch_schedules",
      "action_items",
      "user_contexts",
      "emails",
      "email_threads",
      "google_accounts",
      "users",
    ];

    for (const table of tables) {
      const tableExists = await queryRunner.hasTable(table);
      if (tableExists) {
        await queryRunner.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      }
    }

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "user_contexts_source_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "user_contexts_contextkey_enum"`,
    );
  }
}
