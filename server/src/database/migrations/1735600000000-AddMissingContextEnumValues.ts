import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingContextEnumValues1735600000000 implements MigrationInterface {
    name = 'AddMissingContextEnumValues1735600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add missing enum values that are used in code but missing from database
        // Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE, so we use a DO block to check first
        await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VIP_CONTACT' AND enumtypid = 'user_contexts_contextkey_enum'::regtype) THEN
                    ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE 'VIP_CONTACT';
                END IF;
            END $$;
        `);
        
        await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'USER_INFO' AND enumtypid = 'user_contexts_contextkey_enum'::regtype) THEN
                    ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE 'USER_INFO';
                END IF;
            END $$;
        `);
        
        await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'URGENT' AND enumtypid = 'user_contexts_contextkey_enum'::regtype) THEN
                    ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE 'URGENT';
                END IF;
            END $$;
        `);
        
        await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'NOT_IMPORTANT' AND enumtypid = 'user_contexts_contextkey_enum'::regtype) THEN
                    ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE 'NOT_IMPORTANT';
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: Removing enum values in PostgreSQL is complex and often not done in down migrations
        // The enum values will remain in the database but won't be used
    }
}

