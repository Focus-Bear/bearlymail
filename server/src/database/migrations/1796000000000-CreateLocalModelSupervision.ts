import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adaptive LLM-supervision of the local category model.
 *
 * Creates `local_model_supervision`: per-(user, category) state driving how
 * large a share of that category's confident local-model predictions we divert
 * to the LLM to score. `categoryHash` (SHA-256 of the normalised name) is the
 * queryable/unique key; `category` holds the encrypted plaintext name for
 * admin/debug only. `window*` accumulate the current measurement window.
 */
export class CreateLocalModelSupervision1796000000000
  implements MigrationInterface
{
  name = "CreateLocalModelSupervision1796000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "local_model_supervision" (
        "id"                 uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "userId"             uuid        NOT NULL,
        "categoryHash"       varchar     NOT NULL,
        "category"           text        NOT NULL,
        "sampleRatePercent"  integer     NOT NULL DEFAULT 50,
        "windowSamples"      integer     NOT NULL DEFAULT 0,
        "windowAgreements"   integer     NOT NULL DEFAULT 0,
        "createdAt"          TIMESTAMP   NOT NULL DEFAULT now(),
        "updatedAt"          TIMESTAMP   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_local_model_supervision" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_local_model_supervision_user_category"
          UNIQUE ("userId", "categoryHash")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "local_model_supervision"`,
    );
  }
}
