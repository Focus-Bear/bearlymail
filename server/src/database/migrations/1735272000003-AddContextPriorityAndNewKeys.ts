import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContextPriorityAndNewKeys1735272000003 implements MigrationInterface {
    name = 'AddContextPriorityAndNewKeys1735272000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add priority column to user_contexts
        await queryRunner.query(`ALTER TABLE "user_contexts" ADD "priority" integer`);
        
        // Update the enum type to include new values
        // First, we need to alter the enum type
        await queryRunner.query(`ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE IF NOT EXISTS 'MY_GOALS'`);
        await queryRunner.query(`ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE IF NOT EXISTS 'DONT_CARE'`);
        await queryRunner.query(`ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE IF NOT EXISTS 'WORKING_ON'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_contexts" DROP COLUMN "priority"`);
        // Note: Removing enum values in PostgreSQL is complex and often not done in down migrations
    }
}

