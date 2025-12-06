import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureContextEnumValues1735700000000 implements MigrationInterface {
    name = 'EnsureContextEnumValues1735700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Ensure all required enum values exist - this migration is idempotent
        // It will only add values that don't already exist
        // This includes ALL enum values from the ContextKey enum
        
        const enumValues = [
            'VIP_CONTACT',
            'MY_GOALS',
            'DONT_CARE',
            'WORKING_ON',
            'USER_INFO',
            'URGENT',
            'NOT_IMPORTANT',
            'PROJECT_NAME',
            'COLLEAGUE_NAME',
            'CURRENT_TOPIC',
            'WRITING_STYLE_TONE',
            'COMMON_PHRASE',
            'AVERAGE_REPLY_TIME',
            'OTHER',
        ];
        
        for (const enumValue of enumValues) {
            await queryRunner.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum 
                        WHERE enumlabel = '${enumValue}' 
                        AND enumtypid = 'user_contexts_contextkey_enum'::regtype
                    ) THEN
                        ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE '${enumValue}';
                    END IF;
                END $$;
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: Removing enum values in PostgreSQL is complex and often not done in down migrations
        // The enum values will remain in the database but won't be used
    }
}

