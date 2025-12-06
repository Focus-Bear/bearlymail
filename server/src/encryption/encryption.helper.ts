import * as crypto from 'crypto';

/**
 * Static encryption helper for use in TypeORM column transformers
 * Gets encryption key from environment variable
 */
class EncryptionHelper {
  private static algorithm = 'aes-256-gcm';
  private static ivLength = 16;
  private static keyCache: Buffer | null = null;

  private static getKey(): Buffer {
    if (this.keyCache) {
      return this.keyCache;
    }

    const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32chars!!';
    this.keyCache = crypto.scryptSync(keyString, 'salt', 32);
    return this.keyCache;
  }

  static encrypt(text: string | null | undefined): string | null {
    if (!text) return null;
    
    try {
      const key = this.getKey();
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Combine IV, authTag, and encrypted data
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  static decrypt(encryptedText: string | null | undefined): string | null {
    if (!encryptedText) return null;
    
    try {
      // Check if this is already decrypted (for backwards compatibility during migration)
      if (!encryptedText.includes(':')) {
        return encryptedText;
      }

      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        // Not in expected format, might be plaintext
        return encryptedText;
      }

      const key = this.getKey();
      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv) as crypto.DecipherGCM;
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      // Return original if decryption fails (might be plaintext from before encryption)
      return encryptedText;
    }
  }

  static hashEmail(email: string): string {
    if (!email) return '';
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }
}

/**
 * TypeORM transformer for encrypted columns
 */
export const encryptedColumnTransformer = {
  to: (value: string | null | undefined): string | null => {
    return EncryptionHelper.encrypt(value);
  },
  from: (value: string | null | undefined): string | null => {
    return EncryptionHelper.decrypt(value);
  },
};

/**
 * For email addresses - we need to query by them, so we store:
 * - emailHash: SHA-256 hash for querying (not encrypted)
 * - email: encrypted actual email
 */
export const emailTransformer = {
  to: (value: string | null | undefined): string | null => {
    return EncryptionHelper.encrypt(value);
  },
  from: (value: string | null | undefined): string | null => {
    return EncryptionHelper.decrypt(value);
  },
};

export const encryptedJsonTransformer = {
  to: (value: any): string | null => {
    if (value === null || value === undefined) return null;
    const stringified = JSON.stringify(value);
    return EncryptionHelper.encrypt(stringified);
  },
  from: (value: string | null | undefined): any => {
    const decrypted = EncryptionHelper.decrypt(value);
    if (!decrypted) return null;
    try {
      return JSON.parse(decrypted);
    } catch (e) {
      console.error('Failed to parse decrypted JSON', e);
      return null;
    }
  },
};

export { EncryptionHelper };

