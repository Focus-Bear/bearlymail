import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import * as path from 'path';
import { DataSource } from 'typeorm';

import { User } from '../src/database/entities/user.entity';
import { encryptionKeyProvider } from '../src/encryption/encryption-key-provider';
import { EncryptionHelper } from '../src/encryption/encryption.helper';

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

/**
 * Seeds a single approved local-mode user (no sample emails, unlike
 * seed-test-user.ts) so `npm run local` can log in past the closed
 * registration / waitlist gate. Credentials come from LOCAL_USER_EMAIL and
 * LOCAL_USER_PASSWORD. Idempotent: re-running updates the password and flags.
 */
async function seedLocalUser() {
  const email = process.env.LOCAL_USER_EMAIL || 'local@bearlymail.local';
  const password = process.env.LOCAL_USER_PASSWORD;
  if (!password) {
    throw new Error('LOCAL_USER_PASSWORD environment variable is required');
  }

  await dataSource.initialize();
  const userRepository = dataSource.getRepository(User);
  const emailHash = EncryptionHelper.hashEmail(email);
  const hashedPassword = await bcrypt.hash(password, 10);
  const now = new Date();

  const existingUser = await userRepository.findOne({ where: { emailHash } });
  if (existingUser) {
    existingUser.password = hashedPassword;
    existingUser.isApproved = true;
    existingUser.isAdmin = true;
    await userRepository.save(existingUser);
    console.log(`Local user ${email} already exists — password refreshed`);
    return;
  }

  const encryptedEmail = EncryptionHelper.encrypt(email);
  if (!encryptedEmail) {
    throw new Error('Failed to encrypt email. Check ENCRYPTION_KEY environment variable.');
  }

  await userRepository.save(
    userRepository.create({
      email: encryptedEmail,
      emailHash,
      password: hashedPassword,
      name: 'Local User',
      isApproved: true,
      isAdmin: true,
      // Left NOT-onboarded so the first login runs the setup wizard
      // (batching preferences + AI training).
      termsAcceptedAt: now,
      termsVersion: process.env.TERMS_VERSION || '1.0.0',
      privacyAcceptedAt: now,
      privacyVersion: process.env.PRIVACY_VERSION || '1.0.0',
    }),
  );
  console.log(`Local user ${email} created`);
}

seedLocalUser()
  .then(() => dataSource.destroy())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to seed local user:', error);
    process.exit(1);
  });
