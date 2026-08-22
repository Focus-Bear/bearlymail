import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds lifetime counters to `local_model_supervision`.
 *
 * `window*` counters reset every measurement window, so they are a noisy
 * accuracy readout. `lifetimeSamples` / `lifetimeAgreements` never reset and
 * power the admin "Local model accuracy (vs LLM)" view.
 */
export class AddLifetimeCountersToLocalModelSupervision1796100000000
  implements MigrationInterface
{
  name = "AddLifetimeCountersToLocalModelSupervision1796100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "local_model_supervision" ADD COLUMN IF NOT EXISTS "lifetimeSamples" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "local_model_supervision" ADD COLUMN IF NOT EXISTS "lifetimeAgreements" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "local_model_supervision" DROP COLUMN IF EXISTS "lifetimeAgreements"`,
    );
    await queryRunner.query(
      `ALTER TABLE "local_model_supervision" DROP COLUMN IF EXISTS "lifetimeSamples"`,
    );
  }
}
