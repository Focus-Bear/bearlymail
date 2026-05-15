/**
 * Per-user KMS key provisioning script.
 *
 * For each existing user that has no `encryptedDataKey`, generates a new KMS data key
 * and stores the encrypted ciphertext in the database. Existing email data retains its
 * current encryption (global key); the fallback decrypt in `tryDecrypt` handles reading
 * it until a full re-encryption pass is done.
 *
 * Usage (requires KMS_KEY_ID and valid AWS credentials):
 *   ts-node -r tsconfig-paths/register src/scripts/migrate-to-kms-encryption.ts
 *
 * This script is idempotent — safe to run multiple times.
 */

import "reflect-metadata";

import * as dotenv from "dotenv";

dotenv.config();

import { encryptionKeyProvider } from "../encryption/encryption-key-provider";

encryptionKeyProvider.initialize();

import { DataSource, DataSourceOptions } from "typeorm";

import { User } from "../database/entities/user.entity";
import { createTypeOrmConfig } from "../database/typeorm-config.factory";
import { KmsEncryptionService } from "../encryption/kms-encryption.service";

async function main() {
  if (!process.env.KMS_KEY_ID) {
    console.error("KMS_KEY_ID environment variable is required.");
    process.exit(1);
  }

  const dataSource = new DataSource(
    createTypeOrmConfig({ get: (key: string) => process.env[key] } as never, {
      entities: [User],
    }) as unknown as DataSourceOptions,
  );
  await dataSource.initialize();

  const kms = new KmsEncryptionService();
  const userRepo = dataSource.getRepository(User);

  const users = await userRepo
    .createQueryBuilder("u")
    .select(["u.id", "u.encryptedDataKey"])
    .where("u.encryptedDataKey IS NULL")
    .getMany();

  console.log(`Found ${users.length} users without a KMS data key.`);

  let success = 0;
  for (const user of users) {
    try {
      const { encryptedKey } = await kms.generateDataKey();
      await userRepo.update(user.id, {
        encryptedDataKey: encryptedKey.toString("base64"),
      });
      success++;
      console.log(`Provisioned key for user ${user.id}`);
    } catch (err) {
      // nosemgrep
      console.error(`Failed for user ${user.id}:`, err);
    }
  }

  console.log(`Done. Provisioned ${success}/${users.length} users.`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
