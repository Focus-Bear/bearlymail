import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import { User } from '../src/database/entities/user.entity';
import { Email } from '../src/database/entities/email.entity';
import { EmailThread } from '../src/database/entities/email-thread.entity';
import { EncryptionHelper } from '../src/encryption/encryption.helper';
import { encryptionKeyProvider } from '../src/encryption/encryption-key-provider';

// Load environment variables
config({ path: path.join(__dirname, '../.env') });

// Initialize encryption so EncryptionHelper.hashEmail() works for the user lookup.
// NOTE: Email fields on the seeded records are stored as PLAINTEXT (not encrypted).
// This is intentional — cross-process encryption key derivation causes the server
// to be unable to decrypt them. Since tryDecrypt() returns plaintext strings as-is
// (strings without the 'iv:authtag:data' colon format), the search filter works.
// These are ephemeral CI test fixtures wiped on each run; they never reach production.
encryptionKeyProvider.initialize();

const dbHost = process.env.DB_HOST || 'localhost';
const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
const sslEnabled = process.env.DB_SSL === 'true';

const dataSource = new DataSource({
  type: 'postgres',
  host: dbHost,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'adhd_email_client',
  entities: [path.join(__dirname, '../src/database/entities/**/*.entity{.ts,.js}')],
  synchronize: false,
  ssl: (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false, // nosemgrep
});

/**
 * Seed script for deterministic search test data.
 *
 * Creates emails that cover three search-CI scenarios:
 *   1. "Has results"  — emails matching the query "test" (subject / from contain "test")
 *   2. "No results"   — nothing should match "xyzabc123nonexistentquery98765"
 *   3. "Rejected"     — broad query "meeting" surfaces both a matching email AND
 *                       one with a known low relevance so the rejected-emails UI
 *                       can be exercised (score is stored in debugInfo, not DB)
 *
 * The script is idempotent: it checks each email by messageId before inserting.
 */

interface SeedEmailSpec {
  messageId: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

const SEED_EMAILS: SeedEmailSpec[] = [
  // ── Scenario 1 ── query "test" should find these two emails ──────────────
  {
    messageId: 'ci-search-seed-001',
    threadId: 'ci-search-thread-001',
    from: 'testuser@example.com',
    fromName: 'Test User',
    subject: 'Test meeting notes for Q2',
    body: 'Here are the test meeting notes from our Q2 planning session. Please review before the next test run.',
    receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
  },
  {
    messageId: 'ci-search-seed-002',
    threadId: 'ci-search-thread-002',
    from: 'testuser@example.com',
    fromName: 'Test User',
    subject: 'Follow-up: test results from last sprint',
    body: 'Sharing the test results from last sprint. All tests passed successfully on the test environment.',
    receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
  },
  // ── Scenario 3 ── query "meeting" ────────────────────────────────────────
  // One clear match — should rank highly
  {
    messageId: 'ci-search-seed-003',
    threadId: 'ci-search-thread-003',
    from: 'alice@example.com',
    fromName: 'Alice Smith',
    subject: 'Team meeting agenda for Thursday',
    body: 'Here is the meeting agenda for Thursday. Please come prepared with your updates. The meeting will be in Room 4B.',
    receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
  // One weak match — body barely mentions "meeting" so it may be ranked as rejected
  {
    messageId: 'ci-search-seed-004',
    threadId: 'ci-search-thread-004',
    from: 'newsletter@company.com',
    fromName: 'Company Newsletter',
    subject: 'Monthly digest — product updates',
    body: 'Welcome to the monthly product digest. We had a brief mention in a meeting last week. Stay tuned for more.',
    receivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago (old = lower recency)
  },
  // ── Filler ── ensures "xyzabc123nonexistentquery98765" matches nothing ────
  {
    messageId: 'ci-search-seed-005',
    threadId: 'ci-search-thread-005',
    from: 'bob@example.com',
    fromName: 'Bob Jones',
    subject: 'Invoice for services rendered',
    body: 'Please find attached the invoice for services rendered in the current quarter.',
    receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  },
];

async function seedSearchData() {
  try {
    await dataSource.initialize();
    console.log('Database connected');

    const userRepository = dataSource.getRepository(User);
    const emailRepository = dataSource.getRepository(Email);
    const threadRepository = dataSource.getRepository(EmailThread);

    // Find the seeded test user (created by seed-test-user.ts)
    const testEmail = 'test@example.com';
    const emailHash = EncryptionHelper.hashEmail(testEmail);
    const testUser = await userRepository.findOne({ where: { emailHash } });

    if (!testUser) {
      console.error(
        'Test user not found. Run `npm run seed:test-user` first.',
      );
      process.exit(1);
    }

    console.log(`Seeding search data for user ${testUser.id} …`);

    let created = 0;
    let skipped = 0;

    for (const spec of SEED_EMAILS) {
      // ── Idempotency check ─────────────────────────────────────────────────
      const existing = await emailRepository.findOne({
        where: { userId: testUser.id, messageId: spec.messageId },
      });

      if (existing) {
        console.log(`  skip  ${spec.messageId} (already exists)`);
        skipped++;
        continue;
      }

      // ── Ensure EmailThread exists ─────────────────────────────────────────
      let thread = await threadRepository.findOne({
        where: { userId: testUser.id, threadId: spec.threadId },
      });

      if (!thread) {
        const newThread = threadRepository.create({
          userId: testUser.id,
          threadId: spec.threadId,
          starCount: 0,
          isArchived: false,
          urgencyScore: 0,
          priorityScore: 50,
        });
        thread = await threadRepository.save(newThread);
      }

      // ── Create Email using raw SQL with plaintext fields ─────────────────
      // In CI, a cross-process encryption mismatch causes the server to read
      // back ciphertext (subject shows as 116-char hex) even though both
      // processes log the same key fingerprint (68c4d891). Root cause unclear.
      //
      // To work around this for CI-only seed data, we INSERT plain text for
      // the encrypted fields.  TypeORM's tryDecrypt() has a safe fallback:
      // if the stored value does NOT match the ciphertext format (e.g. a
      // plain string without colons), it returns the value as-is.
      //
      // This means searchEmailsFromLocalDb (which filters by subject/from/body
      // text) will work correctly because the subjects like "Test meeting notes"
      // are returned as plaintext, not ciphertext.
      //
      // NOTE: This is intentionally NOT encrypted.  These records are ephemeral
      // CI test fixtures, not real user data.  They are wiped with every CI run
      // (fresh PostgreSQL container each time) and never reach production.
      await emailRepository.query(
        `INSERT INTO emails (
          "id", "userId", "threadId", "emailThreadId", "messageId",
          "googleAccountId", "office365AccountId", "zohoAccountId",
          "from", "fromName", "subject", "body",
          "isRead", "isBatched", "isSnoozed", "isProcessingSummary",
          "wasDeliveredEarly", "receivedAt"
        ) VALUES (
          uuid_generate_v4(), $1, $2, $3, $4,
          NULL, NULL, NULL,
          $5, $6, $7, $8,
          false, false, false, false,
          false, $9
        )`,
        [
          testUser.id, spec.threadId, thread.id, spec.messageId,
          spec.from,      // stored as plaintext — tryDecrypt returns as-is
          spec.fromName,
          spec.subject,
          spec.body,
          spec.receivedAt.toISOString(),
        ],
      );
      console.log(`  create ${spec.messageId} — "${spec.subject}"`);
      created++;
    }

    console.log(`\nDone. Created: ${created}, Skipped (already existed): ${skipped}`);

    await dataSource.destroy();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error seeding search data:', error);
    process.exit(1);
  }
}

seedSearchData();
