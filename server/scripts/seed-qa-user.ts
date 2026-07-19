import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import * as path from 'path';
import { User } from '../src/database/entities/user.entity';
import { Email } from '../src/database/entities/email.entity';
import { EmailThread } from '../src/database/entities/email-thread.entity';
import { UserContext, ContextKey, Source } from '../src/database/entities/user-context.entity';
import { SummarizationRule } from '../src/database/entities/summarization-rule.entity';
import { BlockedSender } from '../src/database/entities/blocked-sender.entity';
import { Contact } from '../src/database/entities/contact.entity';
import { EncryptionHelper } from '../src/encryption/encryption.helper';

// Load environment variables from .env file
config({ path: path.join(__dirname, '../.env') });

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

// ─── Constants ────────────────────────────────────────────────────────────────

const QA_EMAIL = 'qa@bearlymail.test';
const QA_PASSWORD = process.env.QA_TEST_PASSWORD || 'QaPassword123!';
const QA_NAME = 'Professor Reproducible';

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
  snoozeUntil?: Date;
  isArchived: boolean;
  urgencyScore: number;
  priorityScore: number;
  starCount: number;
}

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

const SEED_EMAILS: SeedEmailSpec[] = [
  // ── Inbox / unread (5) ────────────────────────────────────────────────────
  {
    messageId: 'qa-seed-inbox-001',
    threadId: 'qa-thread-inbox-001',
    from: 'alice@acme.com',
    fromName: 'Alice Smith',
    subject: 'Q3 roadmap review — can we sync Friday?',
    body: 'Hi Professor,\n\nWanted to loop in on the Q3 roadmap before the planning session on Friday. Do you have 30 min at 2pm? I have a few blockers I need your input on.\n\nCheers,\nAlice',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 70,
    priorityScore: 80,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-inbox-002',
    threadId: 'qa-thread-inbox-002',
    from: 'bob@partner.org',
    fromName: 'Bob Jones',
    subject: 'Partnership proposal: co-marketing in Q4',
    body: 'Hello,\n\nWe\'ve been big fans of BearlyMail and would love to explore a co-marketing arrangement for Q4. Attached is our initial proposal.\n\nLet me know if you\'d like to discuss.\n\nBest,\nBob',
    receivedAt: daysAgo(2),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 40,
    priorityScore: 60,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-inbox-003',
    threadId: 'qa-thread-inbox-003',
    from: 'support@stripe.com',
    fromName: 'Stripe',
    subject: 'Your invoice is ready — $349.00 due 2026-03-15',
    body: 'Your monthly invoice for $349.00 is ready. Payment will be automatically charged to your card on file on 2026-03-15.\n\nView invoice: https://dashboard.stripe.com/invoices/in_fake001',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 50,
    priorityScore: 55,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-inbox-004',
    threadId: 'qa-thread-inbox-004',
    from: 'noreply@github.com',
    fromName: 'GitHub',
    subject: '[Focus-Bear/BearlyMail] PR #654: fix: email thread rendering',
    body: 'A pull request was opened by raccoon-refactor:\n\nfix: email thread rendering in grouped view\n\nThis fixes the edge case where threads with >10 replies were truncated incorrectly.',
    receivedAt: daysAgo(0),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 30,
    priorityScore: 45,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-inbox-005',
    threadId: 'qa-thread-inbox-005',
    from: 'ceo@acme.com',
    fromName: 'Carol Whitfield',
    subject: 'Urgent: contract sign-off needed before EOD',
    body: 'Professor,\n\nOur legal team says we need your signature on the MSA by end of business today or the deal rolls to next quarter. Please review and sign ASAP.\n\nThank you,\nCarol',
    receivedAt: daysAgo(0),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 95,
    priorityScore: 95,
    starCount: 1,
  },
  // ── Newsletters (5) ───────────────────────────────────────────────────────
  {
    messageId: 'qa-seed-newsletter-001',
    threadId: 'qa-thread-newsletter-001',
    from: 'newsletter@digest.io',
    fromName: 'Digest Bot',
    subject: 'Weekly SaaS Digest — Issue #142',
    body: 'This week in SaaS: funding rounds, product launches, and market moves. Highlights: Acme raises $50M Series C, Notion adds AI features, Linear hits 1M users.',
    receivedAt: daysAgo(3),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-newsletter-002',
    threadId: 'qa-thread-newsletter-002',
    from: 'hello@morningbrew.com',
    fromName: 'Morning Brew',
    subject: 'Good morning — here\'s your Tuesday briefing ☕',
    body: 'Start your day informed. Today\'s top stories: Fed holds rates, OpenAI announces new model, and Tesla misses delivery targets. Plus: The weird reason cold brew coffee is trending in Finland.',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-newsletter-003',
    threadId: 'qa-thread-newsletter-003',
    from: 'updates@producthunt.com',
    fromName: 'Product Hunt',
    subject: '🏆 Today\'s top products: AI tools, dev tools & more',
    body: 'Today\'s trending: 1. SuperAI Chat 2. DevPortal Pro 3. AnalyticsDash 4. ResumeBuilder AI 5. CodeSnippets. Check them out!',
    receivedAt: daysAgo(2),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-newsletter-004',
    threadId: 'qa-thread-newsletter-004',
    from: 'news@techcrunch.com',
    fromName: 'TechCrunch',
    subject: 'TechCrunch: This week in AI funding',
    body: 'AI funding rounds this week surpassed $2B as investors pour money into foundation model startups. Key deals: $400M for ModelCo, $180M for VectorBase.',
    receivedAt: daysAgo(5),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-newsletter-005',
    threadId: 'qa-thread-newsletter-005',
    from: 'weekly@indiehackers.com',
    fromName: 'Indie Hackers',
    subject: 'How this founder went from $0 to $40k MRR in 8 months',
    body: 'This week\'s featured interview: how a solo founder built a B2B SaaS from scratch, got their first 10 customers by cold email, and scaled to $40k MRR without outside funding.',
    receivedAt: daysAgo(6),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 5,
    priorityScore: 10,
    starCount: 0,
  },
  // ── Action items (3) ──────────────────────────────────────────────────────
  {
    messageId: 'qa-seed-action-001',
    threadId: 'qa-thread-action-001',
    from: 'alice@acme.com',
    fromName: 'Alice Smith',
    subject: 'Action required: approve budget for Q3 campaign',
    body: 'Hi,\n\nPlease review and approve the attached Q3 campaign budget by Thursday. The marketing team is blocked until we get sign-off.\n\nAction items:\n1. Review budget doc (attached)\n2. Approve or suggest amendments\n3. Reply with decision\n\nThanks,\nAlice',
    receivedAt: daysAgo(2),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 65,
    priorityScore: 70,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-action-002',
    threadId: 'qa-thread-action-002',
    from: 'hr@focusbear.io',
    fromName: 'Focus Bear HR',
    subject: 'Please complete your Q1 self-review by Friday',
    body: 'Hi Professor,\n\nQ1 performance reviews are due Friday. Please complete your self-review in the HR portal and submit by 5pm.\n\nLink: https://hr.focusbear.io/review/q1\n\nThanks,\nHR Team',
    receivedAt: daysAgo(3),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 60,
    priorityScore: 65,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-action-003',
    threadId: 'qa-thread-action-003',
    from: 'legal@focusbear.io',
    fromName: 'Focus Bear Legal',
    subject: 'Contract renewal: DocuSign envelope ready for your signature',
    body: 'Your signature is required on the vendor contract renewal before it expires on 2026-03-10.\n\nSign here: https://docusign.example.com/sign/abc123\n\nThis envelope will expire in 5 days.',
    receivedAt: daysAgo(1),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 80,
    priorityScore: 85,
    starCount: 1,
  },
  // ── Starred / important (3) ───────────────────────────────────────────────
  {
    messageId: 'qa-seed-starred-001',
    threadId: 'qa-thread-starred-001',
    from: 'ceo@acme.com',
    fromName: 'Carol Whitfield',
    subject: 'Loved the demo — when can we start onboarding?',
    body: 'Professor,\n\nThe team loved the BearlyMail demo yesterday. We\'re ready to move forward. When can you start the enterprise onboarding? We have 45 seats to provision.\n\nBest,\nCarol',
    receivedAt: daysAgo(4),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 85,
    priorityScore: 90,
    starCount: 3,
  },
  {
    messageId: 'qa-seed-starred-002',
    threadId: 'qa-thread-starred-002',
    from: 'investor@vcfund.com',
    fromName: 'Marcus Trent',
    subject: 'Following up on our Series A conversation',
    body: 'Hi,\n\nGreat meeting last week. I spoke with my partners and we\'re interested in leading the round. Can we schedule a partner meeting in the next two weeks?\n\nMarcus',
    receivedAt: daysAgo(7),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 75,
    priorityScore: 85,
    starCount: 2,
  },
  {
    messageId: 'qa-seed-starred-003',
    threadId: 'qa-thread-starred-003',
    from: 'press@techblog.io',
    fromName: 'Sophie Adler',
    subject: 'Interview request: BearlyMail for our "Tools We Love" series',
    body: 'Hi Professor,\n\nI\'m writing a feature on productivity tools for neurodivergent professionals and BearlyMail came highly recommended. Would you be open to a 20 min interview?\n\nSophie',
    receivedAt: daysAgo(5),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 50,
    priorityScore: 70,
    starCount: 1,
  },
  // ── Archived (4) ──────────────────────────────────────────────────────────
  {
    messageId: 'qa-seed-archived-001',
    threadId: 'qa-thread-archived-001',
    from: 'noreply@zoom.us',
    fromName: 'Zoom',
    subject: 'Your Zoom meeting recording is ready',
    body: 'Your recording for "Q2 Planning — All Hands" (60 min) is ready. View or download it in your Zoom dashboard.',
    receivedAt: daysAgo(14),
    isRead: true,
    isSnoozed: false,
    isArchived: true,
    urgencyScore: 10,
    priorityScore: 20,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-archived-002',
    threadId: 'qa-thread-archived-002',
    from: 'billing@aws.amazon.com',
    fromName: 'AWS Billing',
    subject: 'Your AWS bill for February 2026 is available',
    body: 'Your AWS bill for February 2026 is $1,247.32. View the detailed breakdown in your AWS Cost Explorer.',
    receivedAt: daysAgo(20),
    isRead: true,
    isSnoozed: false,
    isArchived: true,
    urgencyScore: 10,
    priorityScore: 20,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-archived-003',
    threadId: 'qa-thread-archived-003',
    from: 'no-reply@linkedin.com',
    fromName: 'LinkedIn',
    subject: 'You have 8 new connections this week',
    body: 'You have 8 new connections: James Wu, Priya Sharma, and 6 others. View your network activity in LinkedIn.',
    receivedAt: daysAgo(10),
    isRead: true,
    isSnoozed: false,
    isArchived: true,
    urgencyScore: 5,
    priorityScore: 5,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-archived-004',
    threadId: 'qa-thread-archived-004',
    from: 'team@loom.com',
    fromName: 'Loom',
    subject: 'Alice Smith shared a Loom video with you',
    body: 'Alice Smith shared a Loom recording: "Onboarding walkthrough for new team members". Watch it here: https://loom.com/share/fake001',
    receivedAt: daysAgo(15),
    isRead: true,
    isSnoozed: false,
    isArchived: true,
    urgencyScore: 10,
    priorityScore: 15,
    starCount: 0,
  },
  // ── Snoozed (2) ───────────────────────────────────────────────────────────
  {
    messageId: 'qa-seed-snoozed-001',
    threadId: 'qa-thread-snoozed-001',
    from: 'bob@partner.org',
    fromName: 'Bob Jones',
    subject: 'Check-in: Q4 partnership kickoff',
    body: 'Hi,\n\nJust following up on the partnership proposal I sent last week. No rush — happy to chat when you\'re ready.\n\nBob',
    receivedAt: daysAgo(8),
    isRead: true,
    isSnoozed: true,
    snoozeUntil: daysFromNow(7),
    isArchived: false,
    urgencyScore: 20,
    priorityScore: 35,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-snoozed-002',
    threadId: 'qa-thread-snoozed-002',
    from: 'events@confhub.io',
    fromName: 'ConfHub',
    subject: 'Early bird tickets: NeuroDev Summit 2026',
    body: 'Early bird tickets for the NeuroDev Summit (June 12-14, 2026) are now on sale. Save 30% with code EARLYBIRD. Register by April 1.',
    receivedAt: daysAgo(3),
    isRead: true,
    isSnoozed: true,
    snoozeUntil: daysFromNow(14),
    isArchived: false,
    urgencyScore: 15,
    priorityScore: 25,
    starCount: 0,
  },
  // ── Thread (1 thread × 3 emails) ──────────────────────────────────────────
  {
    messageId: 'qa-seed-thread-001-msg-1',
    threadId: 'qa-thread-convo-001',
    from: 'alice@acme.com',
    fromName: 'Alice Smith',
    subject: 'Re: Feature request: bulk archive',
    body: 'Hi Professor,\n\nWe\'ve had a few users asking about bulk archive. Is that on the roadmap?\n\nAlice',
    receivedAt: daysAgo(5),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 35,
    priorityScore: 45,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-thread-001-msg-2',
    threadId: 'qa-thread-convo-001',
    from: 'qa@bearlymail.test',
    fromName: 'Professor Reproducible',
    subject: 'Re: Feature request: bulk archive',
    body: 'Yes! It\'s planned for v2.4. Expected in about 6 weeks.\n\n— Professor',
    receivedAt: daysAgo(4),
    isRead: true,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 35,
    priorityScore: 45,
    starCount: 0,
  },
  {
    messageId: 'qa-seed-thread-001-msg-3',
    threadId: 'qa-thread-convo-001',
    from: 'alice@acme.com',
    fromName: 'Alice Smith',
    subject: 'Re: Feature request: bulk archive',
    body: 'Amazing — we\'ll wait for v2.4 then. Thanks for the quick reply! 🙌',
    receivedAt: daysAgo(3),
    isRead: false,
    isSnoozed: false,
    isArchived: false,
    urgencyScore: 35,
    priorityScore: 45,
    starCount: 0,
  },
];

// ─── UserContext seed data ─────────────────────────────────────────────────

interface SeedContextSpec {
  contextKey: ContextKey;
  contextValue: string;
  priority?: number;
  source: Source;
}

const SEED_CONTEXTS: SeedContextSpec[] = [
  { contextKey: ContextKey.EMAIL_CATEGORY, contextValue: '📰 Newsletters', source: Source.USER_EDITED },
  { contextKey: ContextKey.EMAIL_CATEGORY, contextValue: '🛠️ Customer Support', source: Source.USER_EDITED },
  { contextKey: ContextKey.EMAIL_CATEGORY, contextValue: '💼 Partnerships', source: Source.USER_EDITED },
  { contextKey: ContextKey.VIP_CONTACT, contextValue: 'ceo@acme.com', source: Source.USER_EDITED },
  { contextKey: ContextKey.MY_GOALS, contextValue: 'Ship v2 by end of quarter', source: Source.USER_EDITED },
  { contextKey: ContextKey.WORKING_ON, contextValue: 'Focus Bear mobile redesign', priority: 1, source: Source.USER_EDITED },
  { contextKey: ContextKey.DONT_CARE, contextValue: 'Marketing digests older than 7 days', source: Source.USER_EDITED },
];

// ─── SummarizationRule seed data ──────────────────────────────────────────

interface SeedRuleSpec {
  whenToUse: string;
  howToSummarize: string;
}

const SEED_RULES: SeedRuleSpec[] = [
  {
    whenToUse: 'When email is a newsletter or promotional digest',
    howToSummarize: 'Summarize in 1 sentence capturing the main topic or announcement only',
  },
  {
    whenToUse: 'When email contains an action item, task, or request',
    howToSummarize: 'List each task or required action as a bullet point. Be concise and imperative.',
  },
];

// ─── BlockedSender seed data ──────────────────────────────────────────────

interface SeedBlockedSenderSpec {
  email: string;
  senderName: string;
  reason: string;
}

const SEED_BLOCKED_SENDERS: SeedBlockedSenderSpec[] = [
  {
    email: 'spammer@badactor.io',
    senderName: 'Bad Actor',
    reason: 'Unsolicited promotions',
  },
];

// ─── Contact seed data ────────────────────────────────────────────────────

interface SeedContactSpec {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  company: string;
  contactType: string;
}

const SEED_CONTACTS: SeedContactSpec[] = [
  {
    email: 'alice@acme.com',
    name: 'Alice Smith',
    firstName: 'Alice',
    lastName: 'Smith',
    company: 'Acme Corp',
    contactType: 'customer',
  },
  {
    email: 'bob@partner.org',
    name: 'Bob Jones',
    firstName: 'Bob',
    lastName: 'Jones',
    company: 'Partner Org',
    contactType: 'partner',
  },
  {
    email: 'newsletter@digest.io',
    name: 'Digest Bot',
    firstName: 'Digest',
    lastName: 'Bot',
    company: 'Digest.io',
    contactType: 'bot',
  },
];

// ─── Seed helpers ─────────────────────────────────────────────────────────

async function seedUserContexts(
  contextRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_CONTEXTS) {
    // Idempotency: match on userId + contextKey + contextValue
    const existing = await (contextRepo as ReturnType<DataSource['getRepository']>).findOne({
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
      priority: spec.priority ?? null,
      source: spec.source,
    });
    await contextRepo.save(ctx);
    created++;
  }
  console.log(`  UserContext  — created: ${created}, skipped: ${skipped}`);
}

async function seedSummarizationRules(
  ruleRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_RULES) {
    // Idempotency: match on userId + whenToUse
    const existing = await ruleRepo.findOne({
      where: { userId, whenToUse: spec.whenToUse },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const rule = ruleRepo.create({
      userId,
      whenToUse: spec.whenToUse,
      howToSummarize: spec.howToSummarize,
    });
    await ruleRepo.save(rule);
    created++;
  }
  console.log(`  SummarizationRule — created: ${created}, skipped: ${skipped}`);
}

async function seedBlockedSenders(
  blockedRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_BLOCKED_SENDERS) {
    const emailHash = EncryptionHelper.hashEmail(spec.email);
    const existing = await blockedRepo.findOne({
      where: { userId, emailHash },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const blocked = blockedRepo.create({
      userId,
      email: spec.email,
      emailHash,
      senderName: spec.senderName,
      reason: spec.reason,
    });
    await blockedRepo.save(blocked);
    created++;
  }
  console.log(`  BlockedSender — created: ${created}, skipped: ${skipped}`);
}

async function seedContacts(
  contactRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_CONTACTS) {
    const emailHash = EncryptionHelper.hashEmail(spec.email);
    const existing = await contactRepo.findOne({
      where: { userId, emailHash },
    });

    if (existing) {
      skipped++;
      continue;
    }

    const contact = contactRepo.create({
      userId,
      provider: 'manual',
      providerId: `qa-seed-contact-${emailHash.slice(0, 8)}`,
      email: spec.email,
      emailHash,
      name: spec.name,
      firstName: spec.firstName,
      lastName: spec.lastName,
      company: spec.company,
      contactType: spec.contactType,
      isFavorite: spec.contactType === 'customer',
      contactFrequency: 0,
    });
    await contactRepo.save(contact);
    created++;
  }
  console.log(`  Contact — created: ${created}, skipped: ${skipped}`);
}

async function seedEmails(
  emailRepo: ReturnType<DataSource['getRepository']>,
  threadRepo: ReturnType<DataSource['getRepository']>,
  userId: string,
): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const spec of SEED_EMAILS) {
    // ── Idempotency check ─────────────────────────────────────────────────
    const existing = await emailRepo.findOne({
      where: { userId, messageId: spec.messageId },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // ── Ensure EmailThread exists ─────────────────────────────────────────
    let thread = await threadRepo.findOne({
      where: { userId, threadId: spec.threadId },
    });

    if (!thread) {
      const newThread = threadRepo.create({
        userId,
        threadId: spec.threadId,
        starCount: spec.starCount,
        isArchived: spec.isArchived,
        urgencyScore: spec.urgencyScore,
        priorityScore: spec.priorityScore,
      });
      thread = await threadRepo.save(newThread);
    }

    // ── Create Email ──────────────────────────────────────────────────────
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
    };

    if (spec.snoozeUntil) {
      emailData.snoozeUntil = spec.snoozeUntil;
    }

    const email = emailRepo.create(emailData as Parameters<typeof emailRepo.create>[0]);
    await emailRepo.save(email);
    console.log(`    create ${spec.messageId} — "${spec.subject}"`);
    created++;
  }
  console.log(`  Email — created: ${created}, skipped: ${skipped}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function seedQaUser(existingDataSource?: DataSource): Promise<void> {
  const ds = existingDataSource ?? dataSource;
  const isOwned = !existingDataSource;

  if (isOwned) {
    await ds.initialize();
    console.log('Database connected');
  }

  try {
    const userRepository = ds.getRepository(User);
    const emailRepository = ds.getRepository(Email);
    const threadRepository = ds.getRepository(EmailThread);
    const contextRepository = ds.getRepository(UserContext);
    const ruleRepository = ds.getRepository(SummarizationRule);
    const blockedRepository = ds.getRepository(BlockedSender);
    const contactRepository = ds.getRepository(Contact);

    // ── Create or update QA user ───────────────────────────────────────────
    const emailHash = EncryptionHelper.hashEmail(QA_EMAIL);
    let qaUser = await userRepository.findOne({ where: { emailHash } });

    if (qaUser) {
      console.log('QA user already exists — updating settings...');
      const hashedPassword = await bcrypt.hash(QA_PASSWORD, 10);
      qaUser.password = hashedPassword;
      qaUser.isApproved = true;
      qaUser.hasSeenTour = true;
      qaUser.hasCompletedOnboarding = true;
      qaUser.hasScannedHistory = true;
      qaUser = await userRepository.save(qaUser);
      console.log(`  Updated user ${qaUser.id}`);
    } else {
      console.log('Creating QA user...');
      const hashedPassword = await bcrypt.hash(QA_PASSWORD, 10);
      const encryptedEmail = EncryptionHelper.encrypt(QA_EMAIL);

      if (!encryptedEmail) {
        throw new Error('Failed to encrypt email. Check ENCRYPTION_KEY environment variable.');
      }

      const newUser = userRepository.create({
        email: encryptedEmail,
        emailHash,
        password: hashedPassword,
        name: QA_NAME,
        isApproved: true,
        hasSeenTour: true,
        hasCompletedOnboarding: true,
        hasScannedHistory: true,
      });
      qaUser = await userRepository.save(newUser);
      console.log(`  Created user ${qaUser.id}`);
    }

    console.log('\nSeeding related data...');

    await seedEmails(emailRepository, threadRepository, qaUser.id);
    await seedUserContexts(contextRepository, qaUser.id);
    await seedSummarizationRules(ruleRepository, qaUser.id);
    await seedBlockedSenders(blockedRepository, qaUser.id);
    await seedContacts(contactRepository, qaUser.id);

    console.log('\n✅ QA seed complete.');
    console.log(`   Email:    ${QA_EMAIL}`);
    console.log(`   Password: ${QA_PASSWORD}`);
    console.log(`   Name:     ${QA_NAME}`);
  } finally {
    if (isOwned) {
      await ds.destroy();
      console.log('Database connection closed');
    }
  }
}

// Run directly when called as a script
seedQaUser().catch((error) => {
  console.error('Error seeding QA user:', error);
  process.exit(1);
});
