import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * crm_sender_matches: which CRM record (e.g. a Zoho Bigin contact) each sender
 * resolved to, per user and CRM connection, so sender-context lookups fetch the
 * record by ID instead of searching on every open. Rows without a recordId are
 * remembered misses. displayName is encrypted.
 */
export class AddCrmSenderMatches1797865000000 implements MigrationInterface {
  name = "AddCrmSenderMatches1797865000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "crm_sender_matches" (
        "id"                    uuid       NOT NULL DEFAULT uuid_generate_v4(),
        "userId"                uuid       NOT NULL,
        "serverId"              uuid       NOT NULL,
        "connectionFingerprint" varchar    NOT NULL,
        "emailHash"             varchar    NOT NULL,
        "recordModule"          varchar,
        "recordId"              varchar,
        "displayName"           text,
        "matchCount"            integer    NOT NULL DEFAULT 1,
        "matchedAt"             TIMESTAMP  NOT NULL,
        "createdAt"             TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_crm_sender_matches" PRIMARY KEY ("id"),
        CONSTRAINT "FK_crm_sender_matches_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_crm_sender_matches_server"
          FOREIGN KEY ("serverId") REFERENCES "mcp_server_configs"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_crm_sender_matches_userId_serverId_emailHash"
       ON "crm_sender_matches" ("userId", "serverId", "emailHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_crm_sender_matches_userId_serverId_emailHash"`,
    );
    await queryRunner.query(`DROP TABLE "crm_sender_matches"`);
  }
}
