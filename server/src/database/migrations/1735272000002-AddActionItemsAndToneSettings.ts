import { MigrationInterface, QueryRunner } from "typeorm";

export class AddActionItemsAndToneSettings1735272000002 implements MigrationInterface {
    name = 'AddActionItemsAndToneSettings1735272000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create action_items table
        await queryRunner.query(`
            CREATE TABLE "action_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "emailId" uuid,
                "emailThreadId" character varying,
                "description" text NOT NULL,
                "isCompleted" boolean NOT NULL DEFAULT false,
                "source" text NOT NULL DEFAULT 'user',
                "confidenceScore" double precision,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_action_items_id" PRIMARY KEY ("id")
            )
        `);

        // Add foreign keys
        await queryRunner.query(`ALTER TABLE "action_items" ADD CONSTRAINT "FK_action_items_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "action_items" ADD CONSTRAINT "FK_action_items_email" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

        // Add index
        await queryRunner.query(`CREATE INDEX "IDX_action_items_user_completed" ON "action_items" ("userId", "isCompleted")`);

        // Add toneSettings column to users
        await queryRunner.query(`ALTER TABLE "users" ADD "toneSettings" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "toneSettings"`);
        await queryRunner.query(`DROP INDEX "IDX_action_items_user_completed"`);
        await queryRunner.query(`ALTER TABLE "action_items" DROP CONSTRAINT "FK_action_items_email"`);
        await queryRunner.query(`ALTER TABLE "action_items" DROP CONSTRAINT "FK_action_items_user"`);
        await queryRunner.query(`DROP TABLE "action_items"`);
    }
}



