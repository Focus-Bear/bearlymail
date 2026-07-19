import { Injectable, Logger } from "@nestjs/common";
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from "@aws-sdk/client-kms";

/**
 * Thin wrapper around AWS KMS for envelope-encryption key operations.
 *
 * KMS is opt-in: when `KMS_KEY_ID` env var is unset the service is disabled and
 * all callers fall back to the global ENCRYPTION_KEY — identical to pre-KMS behaviour.
 */
@Injectable()
export class KmsEncryptionService {
  private readonly logger = new Logger(KmsEncryptionService.name);
  private readonly kmsKeyId: string | null;
  private readonly client: KMSClient;

  constructor() {
    this.kmsKeyId = process.env.KMS_KEY_ID ?? null;
    this.client = new KMSClient({
      region: process.env.AWS_REGION ?? "ap-southeast-2",
    });
    if (this.kmsKeyId) {
      this.logger.log(
        `KMS envelope encryption enabled. Key ID: ${this.kmsKeyId}`,
      );
    }
  }

  isEnabled(): boolean {
    return !!this.kmsKeyId;
  }

  async generateDataKey(): Promise<{
    plaintextKey: Buffer;
    encryptedKey: Buffer;
  }> {
    if (!this.kmsKeyId) throw new Error("KMS is not configured");

    const result = await this.client.send(
      new GenerateDataKeyCommand({ KeyId: this.kmsKeyId, KeySpec: "AES_256" }),
    );

    if (!result.Plaintext || !result.CiphertextBlob) {
      throw new Error("KMS GenerateDataKey returned incomplete result");
    }

    return {
      plaintextKey: Buffer.from(result.Plaintext),
      encryptedKey: Buffer.from(result.CiphertextBlob),
    };
  }

  async decryptDataKey(encryptedKey: Buffer): Promise<Buffer> {
    if (!this.kmsKeyId) throw new Error("KMS is not configured");

    const result = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: encryptedKey,
        KeyId: this.kmsKeyId,
      }),
    );

    if (!result.Plaintext) {
      throw new Error("KMS Decrypt returned empty plaintext");
    }

    return Buffer.from(result.Plaintext);
  }
}
