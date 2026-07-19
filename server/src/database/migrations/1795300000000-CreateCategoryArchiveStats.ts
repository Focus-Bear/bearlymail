import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Category auto-archive workflows.
 *
 * Creates `category_archive_stats`: a per-(user, category) counter of "blind"
 * archive-alls (the user archived every email in a category without reading or
 * actioning any of them). Once the count crosses the threshold we suggest an
 * auto-archive workflow; `suggestionState` remembers the user's response so we
 * don't keep nagging.
 */
export class CreateCategoryArchiveStats1795300000000
  implements MigrationInterface
{
  name = "CreateCategoryArchiveStats1795300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "category_archive_stats" (
        "id"                    uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"                uuid          NOT NULL,
        "categoryId"            uuid          NOT NULL,
        "blindArchiveAllCount"  integer       NOT NULL DEFAULT 0,
        "suggestionState"       varchar(20)   NOT NULL DEFAULT 'none',
        "lastArchiveAllAt"      timestamptz   NULL,
        "createdAt"             TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"             TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_category_archive_stats" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_category_archive_stats_user_category"
          UNIQUE ("userId", "categoryId")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_category_archive_stats_userId"
       ON "category_archive_stats" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_category_archive_stats_userId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "category_archive_stats"`);
  }
}
