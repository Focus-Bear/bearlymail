import { DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { config } from "dotenv";
import * as path from "path";

// Load environment variables
config({ path: path.join(__dirname, "../.env") });

const configService = new ConfigService();

const dbHost = configService.get<string>("DB_HOST") || "localhost";
const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
const sslEnabled = configService.get<string>("DB_SSL") === "true";

const dataSource = new DataSource({
  type: "postgres",
  host: dbHost,
  port: parseInt(configService.get<string>("DB_PORT") || "5432", 10),
  username: configService.get<string>("DB_USERNAME") || "postgres",
  password: configService.get<string>("DB_PASSWORD") || "postgres",
  database: configService.get<string>("DB_NAME") || "adhd_email_client",
  synchronize: false,
  ssl: !isLocal || sslEnabled ? { rejectUnauthorized: false } : false, // nosemgrep
});

async function checkAndAddIndexes() {
  try {
    await dataSource.initialize();
    console.log("✅ Connected to database");

    const queryRunner = dataSource.createQueryRunner();

    // 1. Check if user_contexts indexes exist
    console.log("\n📊 Checking user_contexts indexes...");
    const userContextsIndexes = await queryRunner.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'user_contexts'
      ORDER BY indexname;
    `);
    console.log(
      "Existing indexes:",
      userContextsIndexes.map((idx: any) => idx.indexname),
    );

    // Check for IDX_user_contexts_userId
    const hasUserIdIndex = userContextsIndexes.some(
      (idx: any) => idx.indexname === "IDX_user_contexts_userId",
    );
    if (!hasUserIdIndex) {
      console.log("⚠️  Missing IDX_user_contexts_userId - creating...");
      await queryRunner.query(`
        CREATE INDEX "IDX_user_contexts_userId"
        ON "user_contexts" ("userId");
      `);
      console.log("✅ Created IDX_user_contexts_userId");
    } else {
      console.log("✅ IDX_user_contexts_userId exists");
    }

    // Check for IDX_user_contexts_userId_contextKey
    const hasUserIdContextKeyIndex = userContextsIndexes.some(
      (idx: any) => idx.indexname === "IDX_user_contexts_userId_contextKey",
    );
    if (!hasUserIdContextKeyIndex) {
      console.log(
        "⚠️  Missing IDX_user_contexts_userId_contextKey - creating...",
      );
      await queryRunner.query(`
        CREATE INDEX "IDX_user_contexts_userId_contextKey"
        ON "user_contexts" ("userId", "contextKey");
      `);
      console.log("✅ Created IDX_user_contexts_userId_contextKey");
    } else {
      console.log("✅ IDX_user_contexts_userId_contextKey exists");
    }

    // 2. Check emails indexes
    console.log("\n📊 Checking emails indexes...");
    const emailsIndexes = await queryRunner.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'emails'
      ORDER BY indexname;
    `);
    console.log(
      "Existing indexes:",
      emailsIndexes.map((idx: any) => idx.indexname),
    );

    // Check for IDX_emails_emailThreadId_priority_received (for DISTINCT ON query)
    const hasDistinctOnIndex = emailsIndexes.some(
      (idx: any) =>
        idx.indexname === "IDX_emails_emailThreadId_priority_received",
    );
    if (!hasDistinctOnIndex) {
      console.log(
        "⚠️  Missing IDX_emails_emailThreadId_priority_received - creating...",
      );
      await queryRunner.query(`
        CREATE INDEX "IDX_emails_emailThreadId_priority_received"
        ON "emails" ("emailThreadId", "priorityScore" DESC NULLS LAST, "receivedAt" DESC);
      `);
      console.log("✅ Created IDX_emails_emailThreadId_priority_received");
    } else {
      console.log("✅ IDX_emails_emailThreadId_priority_received exists");
    }

    // Check for IDX_emails_userId_isBatched_batchReleaseAt
    const hasBatchIndex = emailsIndexes.some(
      (idx: any) =>
        idx.indexname === "IDX_emails_userId_isBatched_batchReleaseAt",
    );
    if (!hasBatchIndex) {
      console.log(
        "⚠️  Missing IDX_emails_userId_isBatched_batchReleaseAt - creating...",
      );
      await queryRunner.query(`
        CREATE INDEX "IDX_emails_userId_isBatched_batchReleaseAt"
        ON "emails" ("userId", "isBatched", "batchReleaseAt");
      `);
      console.log("✅ Created IDX_emails_userId_isBatched_batchReleaseAt");
    } else {
      console.log("✅ IDX_emails_userId_isBatched_batchReleaseAt exists");
    }

    // 3. Check email_threads indexes
    console.log("\n📊 Checking email_threads indexes...");
    const threadsIndexes = await queryRunner.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'email_threads'
      ORDER BY indexname;
    `);
    console.log(
      "Existing indexes:",
      threadsIndexes.map((idx: any) => idx.indexname),
    );

    // Check for partial index for triage mode (if it doesn't exist from migration)
    const hasTriagePartialIndex = threadsIndexes.some(
      (idx: any) => idx.indexname === "IDX_email_threads_userId_triage",
    );
    if (!hasTriagePartialIndex) {
      console.log("⚠️  Missing IDX_email_threads_userId_triage - creating...");
      await queryRunner.query(`
        CREATE INDEX "IDX_email_threads_userId_triage"
        ON "email_threads" ("userId", "starCount")
        WHERE "isArchived" = false AND "starCount" = 0;
      `);
      console.log("✅ Created IDX_email_threads_userId_triage");
    } else {
      console.log("✅ IDX_email_threads_userId_triage exists");
    }

    // 4. Run EXPLAIN ANALYZE on the slow getInbox query to see execution plan
    console.log("\n📊 Analyzing getInbox query performance...");
    const explainResult = await queryRunner.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      WITH matching_threads AS (
        SELECT thread.id, thread."starCount", thread."isArchived"
        FROM email_threads thread
        WHERE thread."userId" = (SELECT id FROM users LIMIT 1)
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
        WHERE email."userId" = (SELECT id FROM users LIMIT 1)
        ORDER BY email."emailThreadId", COALESCE(email."priorityScore", 50) DESC NULLS LAST, email."receivedAt" DESC
      )
      SELECT 
        be.id as email_id,
        be."emailThreadId" as thread_id,
        be."starCount",
        be."isArchived"
      FROM best_emails be
      LIMIT 10;
    `);

    console.log("\n📈 Query Execution Plan:");
    console.log(JSON.stringify(explainResult[0]["QUERY PLAN"], null, 2));

    // 5. Check table sizes and index usage
    console.log("\n📊 Table Statistics:");
    const tableStats = await queryRunner.query(`
      SELECT 
        schemaname,
        relname as tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      WHERE relname IN ('emails', 'email_threads', 'user_contexts', 'users')
      ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;
    `);
    console.table(tableStats);

    await queryRunner.release();
    await dataSource.destroy();
    console.log("\n✅ Done!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

checkAndAddIndexes();
