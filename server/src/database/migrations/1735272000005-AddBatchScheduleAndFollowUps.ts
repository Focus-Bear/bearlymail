import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatchScheduleAndFollowUps1735272000005 implements MigrationInterface {
    name = 'AddBatchScheduleAndFollowUps1735272000005';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create batch_schedules table
        await queryRunner.query(`
            CREATE TABLE "batch_schedules" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "deliveryDays" text NOT NULL,
                "deliveryTimes" text NOT NULL,
                "isEnabled" boolean NOT NULL DEFAULT true,
                "timezone" character varying NOT NULL DEFAULT 'UTC',
                "urgentBypassSchedule" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_batch_schedules" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "batch_schedules" 
            ADD CONSTRAINT "FK_batch_schedules_user" 
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        `);

        // Create follow_ups table
        await queryRunner.query(`
            CREATE TABLE "follow_ups" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "threadId" character varying NOT NULL,
                "emailThreadId" uuid,
                "sentEmailId" character varying,
                "status" character varying NOT NULL DEFAULT 'awaiting_reply',
                "followUpDueAt" TIMESTAMP NOT NULL,
                "followUpDays" integer NOT NULL,
                "lastTheirReply" text,
                "lastTheirReplyFrom" text,
                "lastTheirReplyAt" TIMESTAMP,
                "lastMyReply" text,
                "lastMyReplyAt" TIMESTAMP,
                "draftFollowUp" text,
                "subject" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_follow_ups" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "follow_ups" 
            ADD CONSTRAINT "FK_follow_ups_user" 
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "follow_ups" 
            ADD CONSTRAINT "FK_follow_ups_email_thread" 
            FOREIGN KEY ("emailThreadId") REFERENCES "email_threads"("id") ON DELETE SET NULL
        `);

        // Create indexes for follow_ups
        await queryRunner.query(`CREATE INDEX "IDX_follow_ups_user_status" ON "follow_ups" ("userId", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_follow_ups_user_due" ON "follow_ups" ("userId", "followUpDueAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_follow_ups_user_due"`);
        await queryRunner.query(`DROP INDEX "IDX_follow_ups_user_status"`);
        await queryRunner.query(`ALTER TABLE "follow_ups" DROP CONSTRAINT "FK_follow_ups_email_thread"`);
        await queryRunner.query(`ALTER TABLE "follow_ups" DROP CONSTRAINT "FK_follow_ups_user"`);
        await queryRunner.query(`DROP TABLE "follow_ups"`);
        await queryRunner.query(`ALTER TABLE "batch_schedules" DROP CONSTRAINT "FK_batch_schedules_user"`);
        await queryRunner.query(`DROP TABLE "batch_schedules"`);
    }
}



