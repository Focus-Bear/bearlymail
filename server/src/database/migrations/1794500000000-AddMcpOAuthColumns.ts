import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds MCP-native OAuth 2.0 columns to `mcp_server_configs` so a connection can
 * authenticate via the MCP authorization flow (metadata discovery + dynamic
 * client registration + PKCE authorization code) instead of a pasted bearer
 * token. Existing rows default to `authType = 'bearer'`, preserving behaviour.
 *
 * Issue: MCP-native OAuth connect flow (Google Drive first).
 */
export class AddMcpOAuthColumns1794500000000 implements MigrationInterface {
  name = "AddMcpOAuthColumns1794500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mcp_server_configs"
      ADD COLUMN IF NOT EXISTS "authType" text NOT NULL DEFAULT 'bearer',
      ADD COLUMN IF NOT EXISTS "accessToken" text,
      ADD COLUMN IF NOT EXISTS "refreshToken" text,
      ADD COLUMN IF NOT EXISTS "tokenExpiresAt" timestamp,
      ADD COLUMN IF NOT EXISTS "oauthClientId" text,
      ADD COLUMN IF NOT EXISTS "oauthClientSecret" text,
      ADD COLUMN IF NOT EXISTS "oauthMetadata" jsonb,
      ADD COLUMN IF NOT EXISTS "oauthScope" text,
      ADD COLUMN IF NOT EXISTS "oauthAuthState" text,
      ADD COLUMN IF NOT EXISTS "oauthCodeVerifier" text
    `);
    // The OAuth callback correlates the provider redirect to a config by state.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mcp_server_configs_oauthAuthState"
      ON "mcp_server_configs" ("oauthAuthState")
      WHERE "oauthAuthState" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_mcp_server_configs_oauthAuthState"`,
    );
    await queryRunner.query(`
      ALTER TABLE "mcp_server_configs"
      DROP COLUMN IF EXISTS "oauthCodeVerifier",
      DROP COLUMN IF EXISTS "oauthAuthState",
      DROP COLUMN IF EXISTS "oauthScope",
      DROP COLUMN IF EXISTS "oauthMetadata",
      DROP COLUMN IF EXISTS "oauthClientSecret",
      DROP COLUMN IF EXISTS "oauthClientId",
      DROP COLUMN IF EXISTS "tokenExpiresAt",
      DROP COLUMN IF EXISTS "refreshToken",
      DROP COLUMN IF EXISTS "accessToken",
      DROP COLUMN IF EXISTS "authType"
    `);
  }
}
