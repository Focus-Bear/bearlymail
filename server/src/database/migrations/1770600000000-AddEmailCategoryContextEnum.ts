import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailCategoryContextEnum1770600000000 implements MigrationInterface {
  name = "AddEmailCategoryContextEnum1770600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum 
                    WHERE enumlabel = 'EMAIL_CATEGORY' 
                    AND enumtypid = (
                        SELECT oid FROM pg_type WHERE typname = 'user_contexts_contextkey_enum'
                    )
                ) THEN
                    ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE 'EMAIL_CATEGORY';
                END IF;
            END $$;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: Removing enum values in PostgreSQL is complex and often not done in down migrations
    // The enum value will remain in the database but won't be used
  }
}
