import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Feature #1483 — Automated Email Workflows
 *
 * Creates three new tables:
 *   - workflow_rules          : user-defined email-triggered automation rules
 *   - workflow_execution_logs : audit trail for every workflow execution
 *   - mcp_server_configs      : MCP server connection details per user
 *
 * No changes to existing tables. Workflows are a parallel system to the
 * auto-responder; they share the existing PgBoss job queue infrastructure.
 */
export class AddWorkflowsAndMCPServers1787400000000 implements MigrationInterface {
  name = "AddWorkflowsAndMCPServers1787400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── workflow_rules ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "workflow_rules" (
        "id"        uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    uuid              NOT NULL,
        "name"      text              NOT NULL,
        "enabled"   boolean           NOT NULL DEFAULT true,
        "priority"  integer           NOT NULL DEFAULT 0,
        "condition" jsonb             NOT NULL,
        "actions"   jsonb             NOT NULL,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_rules" PRIMARY KEY ("id"),
        CONSTRAINT "FK_workflow_rules_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_rules_userId_priority"
       ON "workflow_rules" ("userId", "priority")`,
    );

    // ── workflow_execution_logs ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "workflow_execution_logs" (
        "id"                uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "workflowRuleId"    uuid              NOT NULL,
        "userId"            uuid              NOT NULL,
        "emailThreadId"     uuid              NOT NULL,
        "status"            varchar(20)       NOT NULL,
        "actionResults"     jsonb,
        "resolvedVariables" jsonb,
        "executedAt"        TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_execution_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_execution_logs_ruleId"
       ON "workflow_execution_logs" ("workflowRuleId")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_workflow_execution_logs_userId_executedAt"
       ON "workflow_execution_logs" ("userId", "executedAt" DESC)`,
    );

    // ── mcp_server_configs ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "mcp_server_configs" (
        "id"             uuid       NOT NULL DEFAULT uuid_generate_v4(),
        "userId"         uuid       NOT NULL,
        "name"           text       NOT NULL,
        "serverUrl"      text       NOT NULL,
        "apiKey"         text,
        "cachedTools"    jsonb,
        "toolsCachedAt"  TIMESTAMP,
        "enabled"        boolean    NOT NULL DEFAULT true,
        "createdAt"      TIMESTAMP  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mcp_server_configs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mcp_server_configs_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_mcp_server_configs_userId"
       ON "mcp_server_configs" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_mcp_server_configs_userId"`);
    await queryRunner.query(`DROP TABLE "mcp_server_configs"`);

    await queryRunner.query(
      `DROP INDEX "IDX_workflow_execution_logs_userId_executedAt"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_workflow_execution_logs_ruleId"`);
    await queryRunner.query(`DROP TABLE "workflow_execution_logs"`);

    await queryRunner.query(`DROP INDEX "IDX_workflow_rules_userId_priority"`);
    await queryRunner.query(`DROP TABLE "workflow_rules"`);
  }
}
