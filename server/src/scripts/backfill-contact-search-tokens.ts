/**
 * Backfill blind-index `searchTokens` for contacts that have NULL/empty values.
 *
 * Contacts synced before the blind-index search feature was added have `null`
 * `searchTokens`. Contact search runs a `LIKE` query against that column, and
 * `LIKE` never matches NULL — so those legacy contacts are invisible to search
 * (see issue #2030). This one-shot, idempotent backfill regenerates the tokens
 * so they become searchable through the normal indexed path.
 *
 * Why a script and not a SQL/TypeORM migration:
 * Contact PII (name, email, …) is AES-256-GCM encrypted, and under KMS envelope
 * encryption it is encrypted with a *per-user* data key resolved at request time
 * via `UserEncryptionService.withUserKey()`. A migration runs in the migration
 * CLI with only the *global* key in scope and cannot decrypt per-user data, so it
 * would generate empty/garbage tokens. This script iterates users and wraps each
 * in `withUserKey()` so TypeORM transformers decrypt under the correct key. The
 * `tryDecrypt` global-key fallback covers legacy rows still encrypted under the
 * global key, so both encryption regimes are handled.
 *
 * Token generation mirrors the write path exactly (contacts.service.ts upsert):
 *   generateSearchTokens(name, firstName, lastName, company, emailLocalPart, emailDomain)
 *
 * Only the `searchTokens` column is written — encrypted PII columns are left
 * untouched (no re-encryption).
 *
 * Usage (requires DB env vars; KMS_KEY_ID + AWS creds when KMS is enabled):
 *   ts-node -r tsconfig-paths/register src/scripts/backfill-contact-search-tokens.ts [--dry-run] [--user <userId>]
 *   npm run backfill:contact-search-tokens -- --dry-run
 *
 * Idempotent — only touches contacts whose searchTokens are NULL/''/'[]'.
 * Safe to re-run.
 */

import "reflect-metadata";

import * as dotenv from "dotenv";

dotenv.config();

import { DataSource, DataSourceOptions, Repository } from "typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import { Contact } from "../database/entities/contact.entity";
import { User } from "../database/entities/user.entity";
import { createTypeOrmConfig } from "../database/typeorm-config.factory";
import { encryptionKeyProvider } from "../encryption/encryption-key-provider";
import { KmsEncryptionService } from "../encryption/kms-encryption.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";

/** Rows processed per DB page within a single user. */
const PAGE_SIZE = 500;

const NULL_OR_EMPTY_TOKENS = `(contact.searchTokens IS NULL OR contact.searchTokens = '' OR contact.searchTokens = '[]')`;

function regenerateTokens(contact: Contact): string[] {
  const emailLocalPart = SearchIndexHelper.extractEmailLocalPart(contact.email);
  const emailDomain = SearchIndexHelper.extractEmailDomain(contact.email);
  return SearchIndexHelper.generateSearchTokens(
    contact.name,
    contact.firstName,
    contact.lastName,
    contact.company,
    emailLocalPart,
    emailDomain,
  );
}

async function backfillUser(
  userId: string,
  contactRepo: Repository<Contact>,
  dryRun: boolean,
): Promise<{ scanned: number; updated: number; empty: number }> {
  let scanned = 0;
  let updated = 0;
  let empty = 0;

  // Keyset pagination by contact.id. Offset pagination is unsafe here: when a
  // page of contacts resolves to empty tokens we write '[]', which still matches
  // NULL_OR_EMPTY_TOKENS, so re-querying from offset 0 would loop forever on
  // those rows. Keyset works identically for dry-run and non-dry-run.
  let lastId: string | undefined = undefined;
  for (;;) {
    const queryBuilder = contactRepo
      .createQueryBuilder("contact")
      .where("contact.userId = :userId", { userId })
      .andWhere(NULL_OR_EMPTY_TOKENS);

    if (lastId) {
      queryBuilder.andWhere("contact.id > :lastId", { lastId });
    }

    const page = await queryBuilder
      .orderBy("contact.id", "ASC")
      .limit(PAGE_SIZE)
      .getMany();

    if (page.length === 0) break;

    for (const contact of page) {
      scanned++;
      const tokens = regenerateTokens(contact);
      if (tokens.length === 0) {
        // PII was undecryptable (wrong/missing key) — nothing to index. Writing
        // '[]' marks it as processed so it is not rescanned forever.
        empty++;
      }
      if (!dryRun) {
        await contactRepo.update(
          { id: contact.id },
          { searchTokens: JSON.stringify(tokens) },
        );
        updated++;
      }
      lastId = contact.id;
    }

    if (page.length < PAGE_SIZE) break;
  }

  return { scanned, updated, empty };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const userFlagIdx = args.indexOf("--user");
  const onlyUserId = userFlagIdx !== -1 ? args[userFlagIdx + 1] : undefined;

  await encryptionKeyProvider.initializeFromManagedKey();

  const dataSource = new DataSource(
    createTypeOrmConfig({ get: (key: string) => process.env[key] } as never, {
      entities: [Contact, User],
    }) as unknown as DataSourceOptions,
  );
  await dataSource.initialize();

  const contactRepo = dataSource.getRepository(Contact);
  const userRepo = dataSource.getRepository(User);
  const userEncryptionService = new UserEncryptionService(
    userRepo,
    new KmsEncryptionService(),
  );

  // Distinct users that own at least one NULL/empty-token contact.
  const userRows: Array<{ userId: string }> = onlyUserId
    ? [{ userId: onlyUserId }]
    : await contactRepo
        .createQueryBuilder("contact")
        .select("DISTINCT contact.userId", "userId")
        .where(NULL_OR_EMPTY_TOKENS)
        .getRawMany();

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Found ${userRows.length} user(s) with NULL/empty contact searchTokens.`,
  );

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalEmpty = 0;
  let failedUsers = 0;

  for (const { userId } of userRows) {
    try {
      const result = await userEncryptionService.withUserKey(userId, () =>
        backfillUser(userId, contactRepo, dryRun),
      );
      totalScanned += result.scanned;
      totalUpdated += result.updated;
      totalEmpty += result.empty;
      const verb = dryRun ? "would update" : "updated";
      const count = dryRun ? result.scanned : result.updated;
      const emptyNote = result.empty
        ? `, ${result.empty} undecryptable (empty tokens)`
        : "";
      console.log(
        `user ${userId}: scanned ${result.scanned}, ${verb} ${count}${emptyNote}`,
      );
    } catch (err) {
      failedUsers++;
      // nosemgrep
      console.error(`Failed for user ${userId}:`, err);
    }
  }

  const doneVerb = dryRun ? "Would update" : "Updated";
  const doneCount = dryRun ? totalScanned : totalUpdated;
  const succeededUsers = userRows.length - failedUsers;
  const doneEmptyNote = totalEmpty
    ? ` ${totalEmpty} had undecryptable PII (empty tokens).`
    : "";
  const doneFailedNote = failedUsers
    ? ` ${failedUsers} user(s) failed (retryable).`
    : "";
  console.log(
    `Done. ${doneVerb} ${doneCount} contact(s) across ${succeededUsers}/${userRows.length} user(s).${doneEmptyNote}${doneFailedNote}`,
  );

  await dataSource.destroy();
  if (failedUsers > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
