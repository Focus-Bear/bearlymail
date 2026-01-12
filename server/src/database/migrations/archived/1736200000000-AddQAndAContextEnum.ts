import { MigrationInterface, QueryRunner } from "typeorm";

export class AddQAndAContextEnum1736200000000 implements MigrationInterface {
  name = "AddQAndAContextEnum1736200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add Q_AND_A to the user_contexts_contextkey_enum
    await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum 
                    WHERE enumlabel = 'Q_AND_A' 
                    AND enumtypid = (
                        SELECT oid FROM pg_type WHERE typname = 'user_contexts_contextkey_enum'
                    )
                ) THEN
                    ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE 'Q_AND_A';
                END IF;
            END $$;
        `);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Note: Removing enum values in PostgreSQL is complex and often not done in down migrations
    // The enum value will remain in the database but won't be used
  }
}
