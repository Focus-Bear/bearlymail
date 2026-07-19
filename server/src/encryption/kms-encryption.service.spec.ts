import { KmsEncryptionService } from "./kms-encryption.service";

describe("KmsEncryptionService", () => {
  const originalKmsKeyId = process.env.KMS_KEY_ID;

  afterEach(() => {
    if (originalKmsKeyId === undefined) {
      delete process.env.KMS_KEY_ID;
    } else {
      process.env.KMS_KEY_ID = originalKmsKeyId;
    }
  });

  describe("isEnabled()", () => {
    it("returns false when KMS_KEY_ID is not set", () => {
      delete process.env.KMS_KEY_ID;
      const service = new KmsEncryptionService();
      expect(service.isEnabled()).toBe(false);
    });

    it("returns true when KMS_KEY_ID is set", () => {
      process.env.KMS_KEY_ID = "arn:aws:kms:ap-southeast-2:123456789:key/abc";
      const service = new KmsEncryptionService();
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe("generateDataKey()", () => {
    it("throws when KMS is not configured", async () => {
      delete process.env.KMS_KEY_ID;
      const service = new KmsEncryptionService();
      await expect(service.generateDataKey()).rejects.toThrow(
        "KMS is not configured",
      );
    });
  });

  describe("decryptDataKey()", () => {
    it("throws when KMS is not configured", async () => {
      delete process.env.KMS_KEY_ID;
      const service = new KmsEncryptionService();
      await expect(service.decryptDataKey(Buffer.from("fake"))).rejects.toThrow(
        "KMS is not configured",
      );
    });
  });
});
