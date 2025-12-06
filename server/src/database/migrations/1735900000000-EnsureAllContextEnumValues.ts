import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureAllContextEnumValues1735900000000 implements MigrationInterface {
    name = 'EnsureAllContextEnumValues1735900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Ensure ALL enum values from ContextKey enum exist in the database
        // This migration is idempotent and will only add missing values
        
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
        
        // Add each enum value in a separate DO block to ensure they're all processed
        // Note: We can't use parameterized queries with ALTER TYPE, so we build the query with the value
        for (const enumValue of enumValues) {
            // Escape single quotes in enum value name
            const escapedValue = enumValue.replace(/'/g, "''");
            await queryRunner.query(`
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_enum 
                        WHERE enumlabel = '${escapedValue}' 
                        AND enumtypid = (
                            SELECT oid FROM pg_type WHERE typname = 'user_contexts_contextkey_enum'
                        )
                    ) THEN
                        ALTER TYPE "public"."user_contexts_contextkey_enum" ADD VALUE '${escapedValue}';
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

