import { Injectable } from "@nestjs/common";
import { ENCRYPTION_CONSTANTS } from "../constants/encryption-constants";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

@Injectable()
export class EncryptionService {
  private readonly algorithm = "aes-256-gcm";
  private readonly key: Buffer;
  // 16 bytes for AES
  private readonly ivLength = ENCRYPTION_CONSTANTS.IV_LENGTH;

  constructor(private configService: ConfigService) {
    // Get encryption key from environment, or generate a default (should be set in production!)
    const keyString =
      this.configService.get<string>("ENCRYPTION_KEY") ||
      "default-key-change-in-production-32chars!!";

    // Ensure key is 32 bytes (256 bits) for AES-256
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    this.key = crypto.scryptSync(keyString, "salt", 32);
  }

  /**
   * Creates a hash of an email for querying (SHA-256)
   * This allows us to find users by email without decrypting all emails
   */
  hashEmail(email: string): string {
    if (!email) return "";
    return crypto
      .createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }

  /**
   * Encrypts a string value
   */
  encrypt(text: string): string {
    if (!text) return text;

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      // Combine IV, authTag, and encrypted data
      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  /**
   * Decrypts an encrypted string value
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;

    try {
      // Check if this is already decrypted (for backwards compatibility during migration)
      if (!encryptedText.includes(":")) {
        return encryptedText;
      }

      const parts = encryptedText.split(":");
      if (parts.length !== 3) {
        // Not in expected format, might be plaintext
        return encryptedText;
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      // Return original if decryption fails (might be plaintext from before encryption)
      return encryptedText;
    }
  }

  /**
   * Creates a TypeORM transformer for encrypting on write and decrypting on read
   */
  createTransformer() {
    return {
      to: (value: string | null | undefined): string | null => {
        if (value === null || value === undefined) return null;
        return this.encrypt(value);
      },
      from: (value: string | null | undefined): string | null => {
        if (value === null || value === undefined) return null;
        return this.decrypt(value);
      },
    };
  }
}
