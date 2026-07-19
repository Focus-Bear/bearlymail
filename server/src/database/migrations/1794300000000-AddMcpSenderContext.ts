import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Sender-context via MCP servers.
 *
 * - Adds `purpose` + `senderLookupMapping` to mcp_server_configs so a server can
 *   be tagged for sender-context enrichment (existing rows default to "workflow").
 * - Creates mcp_sender_context_cache: per-sender cache of MCP-sourced context,
 *   keyed by the SHA-256 hash of the sender email (encrypted entries).
 */
export class AddMcpSenderContext1794300000000 implements MigrationInterface {
  name = "AddMcpSenderContext1794300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mcp_server_configs"
       ADD COLUMN "purpose" text NOT NULL DEFAULT 'workflow'`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_server_configs"
       ADD COLUMN "senderLookupMapping" jsonb`,
    );

    await queryRunner.query(`
      CREATE TABLE "mcp_sender_context_cache" (
        "id"        uuid       NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    uuid       NOT NULL,
        "emailHash" varchar    NOT NULL,
        "entries"   text,
        "createdAt" TIMESTAMP  NOT NULL DEFAULT now(),
        "fetchedAt" TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mcp_sender_context_cache" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mcp_sender_context_cache_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mcp_sender_context_cache_userId_emailHash"
       ON "mcp_sender_context_cache" ("userId", "emailHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_mcp_sender_context_cache_userId_emailHash"`,
    );
    await queryRunner.query(`DROP TABLE "mcp_sender_context_cache"`);
    await queryRunner.query(
      `ALTER TABLE "mcp_server_configs" DROP COLUMN "senderLookupMapping"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mcp_server_configs" DROP COLUMN "purpose"`,
    );
  }
}
