import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { config } from 'dotenv';
import * as path from 'path';
import { User } from '../src/database/entities/user.entity';
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
  ssl: (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false,
});

async function seedTestUser() {
  try {
    await dataSource.initialize();
    console.log('Database connected');

    const userRepository = dataSource.getRepository(User);
    
    const testEmail = 'test@example.com';
    const testPassword = 'testpassword';
    const emailHash = EncryptionHelper.hashEmail(testEmail);

    // Check if user already exists
    const existingUser = await userRepository.findOne({
      where: { emailHash },
    });

    if (existingUser) {
      console.log('Test user already exists, updating password...');
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      existingUser.password = hashedPassword;
      existingUser.isApproved = true;
      existingUser.hasSeenTour = true; // Skip tour for test user
      existingUser.hasCompletedOnboarding = true; // Skip onboarding wizard in CI
      const now = new Date();
      existingUser.termsAcceptedAt = now; // Accept terms so wizard doesn't block
      existingUser.termsVersion = process.env.TERMS_VERSION || '1.0.0';
      existingUser.privacyAcceptedAt = now; // Accept privacy policy so wizard doesn't block
      existingUser.privacyVersion = process.env.PRIVACY_VERSION || '1.0.0';
      await userRepository.save(existingUser);
      console.log('Test user password updated');
      console.log('Email: test@example.com');
      console.log('Password: testpassword');
    } else {
      console.log('Creating test user...');
      const hashedPassword = await bcrypt.hash(testPassword, 10);
      const encryptedEmail = EncryptionHelper.encrypt(testEmail);
      
      if (!encryptedEmail) {
        throw new Error('Failed to encrypt email. Check ENCRYPTION_KEY environment variable.');
      }
      
      const now = new Date();
      const testUser = userRepository.create({
        email: encryptedEmail,
        emailHash,
        password: hashedPassword,
        name: 'Test User',
        isApproved: true,
        hasSeenTour: true, // Skip tour for test user
        hasCompletedOnboarding: true, // Skip onboarding wizard in CI
        hasScannedHistory: false,
        termsAcceptedAt: now, // Accept terms so wizard doesn't block
        termsVersion: process.env.TERMS_VERSION || '1.0.0',
        privacyAcceptedAt: now, // Accept privacy policy so wizard doesn't block
        privacyVersion: process.env.PRIVACY_VERSION || '1.0.0',
      });

      await userRepository.save(testUser);
      console.log('Test user created successfully');
      console.log('Email: test@example.com');
      console.log('Password: testpassword');
    }

    await dataSource.destroy();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error seeding test user:', error);
    process.exit(1);
  }
}

seedTestUser();

