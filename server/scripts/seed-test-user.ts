import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import * as path from 'path';
import { User } from '../src/database/entities/user.entity';
import { Email } from '../src/database/entities/email.entity';
import { EmailThread } from '../src/database/entities/email-thread.entity';
import { UserContext, ContextKey, Source } from '../src/database/entities/user-context.entity';
import { EncryptionHelper } from '../src/encryption/encryption.helper';
import { encryptionKeyProvider } from '../src/encryption/encryption-key-provider';

// Load environment variables from .env file
config({ path: path.join(__dirname, '../.env') });

// Initialize encryption before any entity operations
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

// ─── Seed Data Specs ──────────────────────────────────────────────────────────

interface SeedEmailSpec {
  messageId: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: Date;
  isRead: boolean;
  isSnoozed: boolean;
  isArchived: boolean;
  urgencyScore: number;
  priorityScore: number;
  starCount: number;
  /** Gmail-style label list (e.g. ['SENT']) to mark outbound emails. */
  labels?: string[];
}

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

// Factor names MUST match the emoji-prefixed format produced by
// EmailPriorityExplanationService.buildExplanationDimensions() so that
// the PriorityTooltip verifyContent() regexes (e.g. /🔥.*Urgency/i) find them.
// Values must sum to ≤ 100 because the tooltip asserts priorityScore ≤ 100.
const PRIORITY_EXPLANATION = {
  score: 80,
  dimensions: {
    urgency: { score: 30, reasons: ['Deadline mentioned', 'Time-sensitive content'] },
    goalAlignment: { score: 20, reasons: ['Related to active project'] },
    vipContact: { score: 20, reasons: ['Known contact'] },
    sentiment: { score: 10, type: 'neutral', reasons: ['Professional tone'] },
  },
  breakdown: [
    { factor: '⭐ VIP Contact',    value: 20, description: 'Contact is important' },
    { factor: '🎯 Goal Alignment', value: 20, description: 'Aligned with current goals' },
    { factor: '🔥 Urgency',        value: 30, description: 'Message appears time-sensitive' },
    { factor: '😊 Sentiment',      value: 10, description: 'Neutral professional tone' },
  ],
  calculatedAt: new Date().toISOString(),
};

const SEED_EMAILS: SeedEmailSpec[] = [
  // ── Triage (starCount=0, isArchived=false) ────────────────────────────────
  {
    messageId: 'ci-inbox-001',
    threadId: 'ci-thread-001',
    from: 'alice@example.com',
    fromName: 'Alice Smith',
    subject: 'Q3 roadmap review — can we sync Friday?',
    body: 'Hi,\n\nWanted to loop in on the Q3 roadmap before the planning session on Friday. Do you have 30 min at 2pm?\n\nCheers,\nAlice',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 70,
    priorityScore: 80,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-002',
    threadId: 'ci-thread-002',
    from: 'bob@partner.org',
    fromName: 'Bob Jones',
    subject: 'Partnership proposal for Q4',
    body: 'Hello,\n\nWe would love to explore a co-marketing arrangement for Q4. Let me know if you\'d like to discuss.\n\nBest,\nBob',
    receivedAt: daysAgo(2),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 40,
    priorityScore: 60,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-003',
    threadId: 'ci-thread-003',
    from: 'support@stripe.com',
    fromName: 'Stripe',
    subject: 'Your invoice is ready — $349.00',
    body: 'Your monthly invoice for $349.00 is ready. Payment will be automatically charged to your card on file.',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 50,
    priorityScore: 55,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-004',
    threadId: 'ci-thread-004',
    from: 'noreply@github.com',
    fromName: 'GitHub',
    subject: '[Focus-Bear/BearlyMail] PR #654: fix email thread rendering',
    body: 'A pull request was opened:\n\nfix: email thread rendering in grouped view\n\nThis fixes the edge case where threads were truncated incorrectly.',
    receivedAt: daysAgo(0),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 30,
    priorityScore: 45,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-005',
    threadId: 'ci-thread-005',
    from: 'carol@acme.com',
    fromName: 'Carol Whitfield',
    subject: 'Follow-up on last week\'s meeting',
    body: 'Hi,\n\nJust following up on the topics we discussed last week. Please let me know your thoughts.\n\nThanks,\nCarol',
    receivedAt: daysAgo(3),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 35,
    priorityScore: 50,
    starCount: 0,
  },
  // ── Action / starred (starCount>0, isArchived=false) ─────────────────────
  {
    messageId: 'ci-inbox-006',
    threadId: 'ci-thread-006',
    from: 'ceo@acme.com',
    fromName: 'The Boss',
    subject: 'Urgent: approval needed before EOD',
    body: 'Our legal team says we need your sign-off by end of business today. Please review ASAP.\n\nThank you',
    receivedAt: daysAgo(0),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 95,
    priorityScore: 95,
    starCount: 1,
  },
  {
    messageId: 'ci-inbox-007',
    threadId: 'ci-thread-007',
    from: 'dave@client.com',
    fromName: 'Dave Client',
    subject: 'Contract renewal discussion',
    body: 'Hi,\n\nOur annual contract is coming up for renewal. Can we schedule a call this week?\n\nBest,\nDave',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 80,
    priorityScore: 85,
    starCount: 1,
  },
  // ── Archived ──────────────────────────────────────────────────────────────
  {
    messageId: 'ci-inbox-008',
    threadId: 'ci-thread-008',
    from: 'newsletter@digest.io',
    fromName: 'Digest Bot',
    subject: 'Weekly SaaS Digest — Issue #142',
    body: 'This week in SaaS: funding rounds, product launches, and market moves.',
    receivedAt: daysAgo(7),
    isRead: true,
    isSnoozed: false,
    isArchived: true,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-009',
    threadId: 'ci-thread-009',
    from: 'hello@morningbrew.com',
    fromName: 'Morning Brew',
    subject: 'Good morning — here\'s your Tuesday briefing ☕',
    body: 'Start your day informed. Today\'s top stories: Fed holds rates, OpenAI announces new model.',
    receivedAt: daysAgo(5),
    isRead: true,
    isSnoozed: false,
    isArchived: true,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  // ── Multi-email thread (3 emails in same thread) ─────────────────────────
  {
    messageId: 'ci-inbox-010',
    threadId: 'ci-thread-010',
    from: 'eve@startup.io',
    fromName: 'Eve Chen',
    subject: 'Re: Integration question',
    body: 'Thanks for the quick reply! One more question: does the API support webhooks?',
    receivedAt: daysAgo(2),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 45,
    priorityScore: 55,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-011',
    threadId: 'ci-thread-010', // same thread
    from: 'support@bearlymail.app',
    fromName: 'BearlyMail Support',
    subject: 'Re: Integration question',
    body: 'Hi Eve, Yes — the API fully supports webhooks. See our docs at docs.bearlymail.app/webhooks.',
    receivedAt: daysAgo(2),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 45,
    priorityScore: 55,
    starCount: 0,
  },
  {
    messageId: 'ci-inbox-012',
    threadId: 'ci-thread-010', // same thread
    from: 'eve@startup.io',
    fromName: 'Eve Chen',
    subject: 'Integration question',
    body: 'Hi,\n\nI\'m trying to integrate BearlyMail with our app. Can you point me to the API docs?\n\nThanks, Eve',
    receivedAt: daysAgo(3),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 45,
    priorityScore: 55,
    starCount: 0,
  },
  // ── E2E canaries — keep subjects in sync with e2e/tests/seeded-inbox-canaries.spec.ts ──
  {
    messageId: 'ci-canary-triage-001',
    threadId: 'ci-thread-canary-triage',
    from: 'canary-triage@e2e.invalid',
    fromName: 'E2E Canary Triage',
    subject: '[E2E Canary] Triage visibility',
    body: 'Synthetic thread for Playwright: must appear in triage (starCount 0).',
    receivedAt: daysAgo(0),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 65,
    priorityScore: 80,
    starCount: 0,
  },
  {
    messageId: 'ci-canary-action-001',
    threadId: 'ci-thread-canary-action',
    from: 'canary-action@e2e.invalid',
    fromName: 'E2E Canary Action',
    subject: '[E2E Canary] Action visibility',
    body: 'Synthetic thread for Playwright: must appear in action (starred, latest from correspondent).',
    receivedAt: daysAgo(0),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 70,
    priorityScore: 82,
    starCount: 1,
  },
  {
    messageId: 'ci-canary-followup-001',
    threadId: 'ci-thread-canary-followup',
    from: 'canary-followup@e2e.invalid',
    fromName: 'E2E Canary Follow-up',
    subject: '[E2E Canary] Follow-up visibility',
    body: 'First message in thread; user replies after this.',
    receivedAt: daysAgo(2),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 55,
    priorityScore: 75,
    starCount: 1,
  },
  {
    messageId: 'ci-canary-followup-002',
    threadId: 'ci-thread-canary-followup',
    from: 'test@example.com',
    fromName: 'Test User',
    subject: 'Re: [E2E Canary] Follow-up visibility',
    body: 'Following up as discussed.',
    receivedAt: daysAgo(1),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 55,
    priorityScore: 75,
    starCount: 1,
    // SENT label marks this as a user-sent email for follow-up detection
    // (mirrors how Gmail labels outbound mail; see email-follow-up.service.ts)
    labels: ['SENT'],
  },
];

const SEED_CONTEXTS = [
  { contextKey: ContextKey.EMAIL_CATEGORY, contextValue: '📰 Newsletters', source: Source.USER_EDITED },
  { contextKey: ContextKey.EMAIL_CATEGORY, contextValue: '💼 Work', source: Source.USER_EDITED },
  { contextKey: ContextKey.EMAIL_CATEGORY, contextValue: '🛠️ Support', source: Source.USER_EDITED },
];

// ─── Seeding Functions ────────────────────────────────────────────────────────

async function seedUserContexts(
  contextRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_CONTEXTS) {
    const existing = await contextRepo.findOne({
      where: { userId, contextKey: spec.contextKey, contextValue: spec.contextValue },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const ctx = contextRepo.create({
      userId,
      contextKey: spec.contextKey,
      contextValue: spec.contextValue,
      priority: null,
      source: spec.source,
    });
    await contextRepo.save(ctx);
    created++;
  }
  console.log(`  UserContext — created: ${created}, skipped: ${skipped}`);
}

async function seedEmails(
  emailRepo: ReturnType<DataSource['getRepository']>,
  threadRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_EMAILS) {
    // Always ensure thread exists and has the current PRIORITY_EXPLANATION.
    // This must happen BEFORE the email-exists check so that re-runs on a
    // pre-seeded DB always refresh stale/old-structure explanations on the
    // thread (e.g. "Base Score" factors, or "Calculating..." placeholders from
    // a previous incomplete run).
    let thread = await threadRepo.findOne({
      where: { userId, threadId: spec.threadId },
    });

    const needsExplanationUpdate =
      !thread ||
      !thread.priorityExplanation ||
      (thread.priorityExplanation as { breakdown?: { factor?: string }[] })?.breakdown?.some(
        (item) =>
          item.factor === 'Base Score' ||
          item.factor === '🤖 AI Analysis' ||
          item.factor === 'AI Analysis',
      ) ||
      (thread.priorityExplanation as { breakdown?: { description?: string }[] })?.breakdown?.some(
        (item) => item.description?.includes('Calculating...'),
      );

    if (!thread) {
      const newThread = threadRepo.create({
        userId,
        threadId: spec.threadId,
        starCount: spec.starCount,
        isArchived: spec.isArchived,
        urgencyScore: spec.urgencyScore,
        priorityScore: spec.priorityScore,
        // Do NOT pass priorityExplanation here — TypeORM transformer encrypts it with
        // the seed-process key, which the server process cannot decrypt in CI due to
        // a known cross-process crypto.scryptSync key mismatch (see seed-search-data.ts).
        // priorityExplanation is written as plaintext JSON via raw SQL below.
      });
      thread = await threadRepo.save(newThread);
    }

    // Always write priorityExplanation as PLAINTEXT JSON via raw SQL.
    //
    // Root cause: TypeORM's encryptedJsonTransformer encrypts with the seed-script
    // process's derived key. The server process cannot decrypt it in CI (cross-process
    // crypto.scryptSync mismatch). EncryptionHelper.tryDecrypt() falls through for
    // non-3-part strings, so a plain JSON value like {"score":80,...} is returned
    // as-is and JSON.parse() succeeds. This ensures the server always reads valid data.
    //
    // Same pattern as seed-search-data.ts (see comment there for full explanation).
    const plainExplanationJson = JSON.stringify(PRIORITY_EXPLANATION);
    await threadRepo.query(
      `UPDATE email_threads SET "priorityExplanation" = $1, "priorityScore" = $2, "isProcessingPriority" = false WHERE id = $3`,
      [plainExplanationJson, spec.priorityScore, thread.id],
    );
    if (needsExplanationUpdate) {
      console.log(`    refresh priorityExplanation (plaintext) on thread ${spec.threadId}`);
    }

    // Idempotency: skip email creation if email already exists
    const existing = await emailRepo.findOne({
      where: { userId, messageId: spec.messageId },
    });

    if (existing) {
      // Patch emailThreadId if it was not persisted on a previous run (TypeORM FK edge case).
      // This ensures the priority-explanation service can look up the thread and return
      // the seeded priorityExplanation instead of falling back to computeFallbackExplanation.
      if (!existing.emailThreadId && thread?.id) {
        console.log(`    [patch] ${spec.messageId}: existing email has null emailThreadId, patching to ${thread.id}`);
        await emailRepo.update({ id: existing.id }, { emailThreadId: thread.id });
      }
      skipped++;
      continue;
    }

    // Create Email — TypeORM save triggers encryptedColumnTransformer
    const emailData: Record<string, unknown> = {
      userId,
      threadId: spec.threadId,
      emailThreadId: thread.id,
      messageId: spec.messageId,
      googleAccountId: null,
      office365AccountId: null,
      zohoAccountId: null,
      from: spec.from,
      fromName: spec.fromName,
      subject: spec.subject,
      body: spec.body,
      isRead: spec.isRead,
      isBatched: false,
      isSnoozed: spec.isSnoozed,
      isProcessingSummary: false,
      wasDeliveredEarly: false,
      receivedAt: spec.receivedAt,
      // Propagate outbound labels (e.g. 'SENT') so follow-up detection works
      ...(spec.labels !== undefined ? { labels: spec.labels } : {}),
    };

    const email = emailRepo.create(emailData as Parameters<typeof emailRepo.create>[0]);
    await emailRepo.save(email);

    // Verify emailThreadId was persisted (Record<string, unknown> cast can bypass TypeORM FK handling)
    const savedEmail = await emailRepo.findOne({ where: { userId, messageId: spec.messageId } });
    if (savedEmail && !savedEmail.emailThreadId) {
      console.log(`    [patch] ${spec.messageId}: emailThreadId was null after save, patching to ${thread.id}`);
      await emailRepo.update({ id: savedEmail.id }, { emailThreadId: thread.id });
    }

    console.log(`    create ${spec.messageId} — "${spec.subject}"`);
    created++;
  }
  console.log(`  Email — created: ${created}, skipped: ${skipped}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedTestUser() {
  try {
    encryptionKeyProvider.initialize();
    await dataSource.initialize();
    console.log('Database connected');

    const userRepository = dataSource.getRepository(User);
    const emailRepository = dataSource.getRepository(Email);
    const threadRepository = dataSource.getRepository(EmailThread);
    const contextRepository = dataSource.getRepository(UserContext);
    
    const testEmail = 'test@example.com';
    const testPassword = 'testpassword';
    const emailHash = EncryptionHelper.hashEmail(testEmail);

    let testUser: User;

    // Check if user already exists
    const existingUser = await userRepository.findOne({
      where: { emailHash },
    });

    if (existingUser) {
      console.log('Test user already exists, updating...');
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      existingUser.password = hashedPassword;
      existingUser.isApproved = true;
      existingUser.hasSeenTour = true;
      existingUser.hasCompletedOnboarding = true;
      existingUser.hasScannedHistory = true;
      const now = new Date();
      existingUser.termsAcceptedAt = now;
      existingUser.termsVersion = process.env.TERMS_VERSION || '1.0.0';
      existingUser.privacyAcceptedAt = now;
      existingUser.privacyVersion = process.env.PRIVACY_VERSION || '1.0.0';
      testUser = await userRepository.save(existingUser);
      console.log('Test user updated');
    } else {
      console.log('Creating test user...');
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      const encryptedEmail = EncryptionHelper.encrypt(testEmail);
      
      if (!encryptedEmail) {
        throw new Error('Failed to encrypt email. Check ENCRYPTION_KEY environment variable.');
      }
      
      const now = new Date();
      const newUser = userRepository.create({
        email: encryptedEmail,
        emailHash,
        password: hashedPassword,
        name: 'Test User',
        isApproved: true,
        hasSeenTour: true,
        hasCompletedOnboarding: true,
        hasScannedHistory: true,
        termsAcceptedAt: now,
        termsVersion: process.env.TERMS_VERSION || '1.0.0',
        privacyAcceptedAt: now,
        privacyVersion: process.env.PRIVACY_VERSION || '1.0.0',
      });

      testUser = await userRepository.save(newUser);
      console.log('Test user created successfully');
    }

    console.log('\nSeeding related data...');
    await seedEmails(emailRepository, threadRepository, testUser.id);
    await seedUserContexts(contextRepository, testUser.id);

    // ── Final FK repair pass ──────────────────────────────────────────────────
    // Explicitly patch ALL emails in the test user's account where emailThreadId
    // is NULL by joining on threadId → EmailThread.id. This covers any emails
    // that were created before the resolveThreadForEmail() FK fix and whose FK
    // was never backfilled by a previous seed run. Without this, the first
    // priority badge in the inbox might still be a non-canary email with a null
    // FK, causing the priority-explanation API to fall back to "Calculating..."
    // placeholders and breaking inbox-load-time.spec.ts:161.
    const patchResult = await dataSource.query(
      `UPDATE "emails" e
         SET "emailThreadId" = et.id
         FROM "email_threads" et
        WHERE e."userId" = $1
          AND e."emailThreadId" IS NULL
          AND et."userId" = $1
          AND et."threadId" = e."threadId"`,
      [testUser.id],
    );
    const patchCount = Array.isArray(patchResult) ? patchResult[1] ?? 0 : 0;
    if (patchCount > 0) {
      console.log(`  [fk-repair] Patched ${patchCount} email(s) with null emailThreadId → correct thread FK`);
    }

    console.log('\n✅ Test user seed complete.');
    console.log('   Email:    test@example.com');
    console.log('   Password: testpassword');
    console.log('   Emails seeded: inbox, action, follow-up canaries, archived, and multi-email thread');

    await dataSource.destroy();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error seeding test user:', error);
    process.exit(1);
  }
}

seedTestUser();
