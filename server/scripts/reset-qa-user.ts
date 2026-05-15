/**
 * reset-qa-user.ts
 *
 * Wipes all data for the QA test user (qa@bearlymail.test) and then
 * re-runs the QA seed script to restore a known-good state.
 *
 * Usage:
 *   npm run seed:qa:reset
 *
 * Safe to run at any time — deletes only data owned by the QA user,
 * then re-seeds from scratch. All other users are unaffected.
 */
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import { User } from '../src/database/entities/user.entity';
import { Email } from '../src/database/entities/email.entity';
import { EmailThread } from '../src/database/entities/email-thread.entity';
import { UserContext } from '../src/database/entities/user-context.entity';
import { SummarizationRule } from '../src/database/entities/summarization-rule.entity';
import { BlockedSender } from '../src/database/entities/blocked-sender.entity';
import { Contact } from '../src/database/entities/contact.entity';
import { EncryptionHelper } from '../src/encryption/encryption.helper';
import { seedQaUser } from './seed-qa-user';

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

const QA_EMAIL = 'qa@bearlymail.test';

async function resetQaUser(): Promise<void> {
  await dataSource.initialize();
  console.log('Database connected');

  try {
    const userRepository = dataSource.getRepository(User);
    const emailRepository = dataSource.getRepository(Email);
    const threadRepository = dataSource.getRepository(EmailThread);
    const contextRepository = dataSource.getRepository(UserContext);
    const ruleRepository = dataSource.getRepository(SummarizationRule);
    const blockedRepository = dataSource.getRepository(BlockedSender);
    const contactRepository = dataSource.getRepository(Contact);

    // Find the QA user
    const emailHash = EncryptionHelper.hashEmail(QA_EMAIL);
    const qaUser = await userRepository.findOne({ where: { emailHash } });

    if (!qaUser) {
      console.log('QA user not found — nothing to wipe. Running seed to create from scratch...');
    } else {
      const userId = qaUser.id;
      console.log(`\nWiping all data for QA user ${userId}...`);

      // Delete in FK-safe order (child tables first)
      const emailCount = await emailRepository.count({ where: { userId } });
      await emailRepository.delete({ userId });
      console.log(`  Deleted ${emailCount} email(s)`);

      const threadCount = await threadRepository.count({ where: { userId } });
      await threadRepository.delete({ userId });
      console.log(`  Deleted ${threadCount} email thread(s)`);

      const contextCount = await contextRepository.count({ where: { userId } });
      await contextRepository.delete({ userId });
      console.log(`  Deleted ${contextCount} user context(s)`);

      const ruleCount = await ruleRepository.count({ where: { userId } });
      await ruleRepository.delete({ userId });
      console.log(`  Deleted ${ruleCount} summarization rule(s)`);

      const blockedCount = await blockedRepository.count({ where: { userId } });
      await blockedRepository.delete({ userId });
      console.log(`  Deleted ${blockedCount} blocked sender(s)`);

      const contactCount = await contactRepository.count({ where: { userId } });
      await contactRepository.delete({ userId });
      console.log(`  Deleted ${contactCount} contact(s)`);

      // Delete the user itself (cascade handles remaining FK relations)
      await userRepository.delete({ id: userId });
      console.log(`  Deleted QA user`);

      console.log('\n✅ Wipe complete.');
    }

    console.log('\nRe-seeding QA data...\n');

    // Re-run seed using the shared DataSource (avoids double-connect)
    await seedQaUser(dataSource);
  } finally {
    await dataSource.destroy();
    console.log('Database connection closed');
  }
}

resetQaUser().catch((error) => {
  console.error('Error resetting QA user:', error);
  process.exit(1);
});
