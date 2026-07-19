import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Clears totpSecret / totpEnabled for every user.
 *
 * Background: totpSecret was originally declared with `encryptedColumnTransformer`
 * (per-user KMS data key). It was later switched to `globalEncryptedColumnTransformer`
 * to avoid the chicken-and-egg of decrypting the user before the per-user key is
 * loaded. Existing rows on prod are still ciphertext-under-per-user-KMS, so reads
 * via the global key fail. The fail-open transformer hands back raw ciphertext,
 * which then crashes base32Decode in the TOTP verifier (HTTP 500 on /auth/mfa/verify).
 *
 * Affected users must re-enroll MFA via Settings. Re-enrolled secrets will be
 * written with the current (global) transformer and decode correctly.
 *
 * Not reversible — TOTP secrets are not recoverable, but users can re-enroll.
 */
export class ResetTotpSecretsForKeyTransformerSwitch1793200000000
  implements MigrationInterface
{
  name = "ResetTotpSecretsForKeyTransformerSwitch1793200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users"
         SET "totpSecret" = NULL,
             "totpEnabled" = false
       WHERE "totpSecret" IS NOT NULL
          OR "totpEnabled" = true`,
    );
  }

  public async down(): Promise<void> {
    // Irreversible — TOTP secrets cannot be reconstructed. Affected users
    // re-enroll via Settings → MFA.
  }
}
