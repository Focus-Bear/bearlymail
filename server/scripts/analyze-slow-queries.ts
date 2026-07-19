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

async function analyzeSlowQueries() {
  try {
    await dataSource.initialize();
    console.log("✅ Connected to database\n");

    const queryRunner = dataSource.createQueryRunner();

    // Get a real user ID for testing
    const users = await queryRunner.query(`SELECT id FROM users LIMIT 1;`);
    if (users.length === 0) {
      console.log("⚠️  No users found in database");
      await queryRunner.release();
      await dataSource.destroy();
      return;
    }
    const userId = users[0].id;
    console.log(`📊 Analyzing queries for user: ${userId}\n`);

    // 1. Analyze getInbox thread_query
    console.log("1️⃣  Analyzing thread_query (getInbox)...");
    const threadQueryResult = await queryRunner.query(
      `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT thread.id, thread."starCount", thread."isArchived"
      FROM email_threads thread
      WHERE thread."userId" = $1
        AND thread."isArchived" = false AND thread."starCount" = 0
      LIMIT 200;
    `,
      [userId],
    );

    const threadPlan = threadQueryResult[0]?.["QUERY PLAN"]?.[0];
    if (threadPlan) {
      console.log(`   Execution Time: ${threadPlan["Execution Time"]}ms`);
      console.log(`   Planning Time: ${threadPlan["Planning Time"]}ms`);
      if (threadPlan.Plan) {
        console.log(`   Node Type: ${threadPlan.Plan["Node Type"]}`);
        console.log(
          `   Actual Total Time: ${threadPlan.Plan["Actual Total Time"]}ms`,
        );
        console.log(`   Actual Rows: ${threadPlan.Plan["Actual Rows"]}`);
        if (threadPlan.Plan["Index Name"]) {
          console.log(`   Index Used: ${threadPlan.Plan["Index Name"]}`);
        }
      }
    }

    // 2. Analyze getInbox email_query (the DISTINCT ON part)
    console.log("\n2️⃣  Analyzing email_query (DISTINCT ON)...");
    const emailQueryResult = await queryRunner.query(
      `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT DISTINCT ON (email."emailThreadId")
        email.id,
        email."emailThreadId"
      FROM emails email
      WHERE email."userId" = $1
        AND email."emailThreadId" IN (
          SELECT id FROM email_threads 
          WHERE "userId" = $1 
            AND "isArchived" = false 
            AND "starCount" = 0 
          LIMIT 200
        )
      ORDER BY email."emailThreadId", COALESCE(email."priorityScore", 50) DESC NULLS LAST, email."receivedAt" DESC;
    `,
      [userId],
    );

    const emailPlan = emailQueryResult[0]?.["QUERY PLAN"]?.[0];
    if (emailPlan) {
      console.log(`   Execution Time: ${emailPlan["Execution Time"]}ms`);
      console.log(`   Planning Time: ${emailPlan["Planning Time"]}ms`);
      if (emailPlan.Plan) {
        console.log(`   Node Type: ${emailPlan.Plan["Node Type"]}`);
        console.log(
          `   Actual Total Time: ${emailPlan.Plan["Actual Total Time"]}ms`,
        );
        console.log(`   Actual Rows: ${emailPlan.Plan["Actual Rows"]}`);
      }
    }

    // 3. Analyze context_query
    console.log("\n3️⃣  Analyzing context_query (triage-suggestions)...");
    const contextQueryResult = await queryRunner.query(
      `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT * FROM user_contexts
      WHERE "userId" = $1
      ORDER BY "lastModified" DESC;
    `,
      [userId],
    );

    const contextPlan = contextQueryResult[0]?.["QUERY PLAN"]?.[0];
    if (contextPlan) {
      console.log(`   Execution Time: ${contextPlan["Execution Time"]}ms`);
      console.log(`   Planning Time: ${contextPlan["Planning Time"]}ms`);
      if (contextPlan.Plan) {
        console.log(`   Node Type: ${contextPlan.Plan["Node Type"]}`);
        console.log(
          `   Actual Total Time: ${contextPlan.Plan["Actual Total Time"]}ms`,
        );
        console.log(`   Actual Rows: ${contextPlan.Plan["Actual Rows"]}`);
        if (contextPlan.Plan["Index Name"]) {
          console.log(`   Index Used: ${contextPlan.Plan["Index Name"]}`);
        } else if (contextPlan.Plan["Node Type"] === "Seq Scan") {
          console.log(
            `   ⚠️  WARNING: Sequential scan detected! Index may not be used.`,
          );
        }
      }
    }

    // 4. Analyze history_query
    console.log("\n4️⃣  Analyzing history_query (triage-suggestions)...");
    const historyQueryResult = await queryRunner.query(
      `
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT email.id, email."userId", email."threadId", email."from", email."fromName", email."subject", email."receivedAt"
      FROM emails email
      INNER JOIN email_threads thread ON thread.id = email."emailThreadId"
      WHERE email."userId" = $1
      ORDER BY email."receivedAt" DESC
      LIMIT 50;
    `,
      [userId],
    );

    const historyPlan = historyQueryResult[0]?.["QUERY PLAN"]?.[0];
    if (historyPlan) {
      console.log(`   Execution Time: ${historyPlan["Execution Time"]}ms`);
      console.log(`   Planning Time: ${historyPlan["Planning Time"]}ms`);
      if (historyPlan.Plan) {
        console.log(`   Node Type: ${historyPlan.Plan["Node Type"]}`);
        console.log(
          `   Actual Total Time: ${historyPlan.Plan["Actual Total Time"]}ms`,
        );
        console.log(`   Actual Rows: ${historyPlan.Plan["Actual Rows"]}`);
      }
    }

    // 5. Check for missing indexes that could help
    console.log("\n5️⃣  Checking for missing indexes...");

    // Check if we need an index on emails for the history query
    const emailsIndexes = await queryRunner.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'emails' 
        AND indexdef LIKE '%userId%receivedAt%';
    `);
    if (emailsIndexes.length === 0) {
      console.log(
        "   ⚠️  Missing index: emails (userId, receivedAt DESC) for history query",
      );
      console.log(
        '   💡 Consider adding: CREATE INDEX "IDX_emails_userId_receivedAt_desc" ON emails ("userId", "receivedAt" DESC);',
      );
    } else {
      console.log(`   ✅ Found index: ${emailsIndexes[0].indexname}`);
    }

    // 6. Check index usage statistics
    console.log("\n6️⃣  Index Usage Statistics:");
    const indexStats = await queryRunner.query(`
      SELECT 
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        idx_scan as index_scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE relname IN ('emails', 'email_threads', 'user_contexts')
        AND indexrelname LIKE 'IDX_%'
      ORDER BY idx_scan DESC
      LIMIT 10;
    `);
    console.table(indexStats);

    // 7. Check email count per thread (to understand DISTINCT ON overhead)
    console.log("\n7️⃣  Email Distribution Analysis:");
    const emailDist = await queryRunner.query(
      `
      SELECT 
        COUNT(*) as total_emails,
        COUNT(DISTINCT "emailThreadId") as total_threads,
        ROUND(AVG(emails_per_thread), 2) as avg_emails_per_thread,
        MAX(emails_per_thread) as max_emails_per_thread
      FROM (
        SELECT "emailThreadId", COUNT(*) as emails_per_thread
        FROM emails
        WHERE "userId" = $1
        GROUP BY "emailThreadId"
      ) thread_counts;
    `,
      [userId],
    );
    console.table(emailDist);

    // 8. Performance note about encryption
    console.log("\n💡 Performance Notes:");
    console.log("   - Queries show fast execution times when there's no data");
    console.log(
      "   - Real-world slowness (551ms thread_query, 834ms email_query) is likely due to:",
    );
    console.log(
      "     1. Encryption/decryption overhead on encrypted columns (from, fromName, subject, contextValue)",
    );
    console.log(
      "     2. DISTINCT ON with ORDER BY processing many rows per thread",
    );
    console.log("     3. TypeORM entity hydration and transformation overhead");
    console.log("   - Consider:");
    console.log(
      "     • Caching decrypted values for frequently accessed emails",
    );
    console.log(
      "     • Using raw queries for list views (skip entity hydration)",
    );
    console.log("     • Limiting the number of emails fetched per thread");

    await queryRunner.release();
    await dataSource.destroy();
    console.log("\n✅ Analysis complete!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

analyzeSlowQueries();
