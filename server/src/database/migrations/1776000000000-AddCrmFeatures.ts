import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCrmFeatures1776000000000 implements MigrationInterface {
  name = "AddCrmFeatures1776000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add CRM fields to contacts table
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "contactType" varchar NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "contacts"."contactType" IS 'Contact type: lead, customer, team_member, advisor, stranger, bot, partner, spammer, or custom'`,
    );

    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "contactTypeAutoDetected" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "contacts"."contactTypeAutoDetected" IS 'Whether contactType was set by LLM auto-detection'`,
    );

    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "followUpDate" TIMESTAMP NULL`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "contacts"."followUpDate" IS 'Follow-up date for CRM tracking'`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contacts_userId_contactType" ON "contacts" ("userId", "contactType")`,
    );

    // Create contact_types table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_types" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "label" varchar NOT NULL,
        "color" varchar NULL,
        "icon" varchar NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_types" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_contact_types_userId_name" ON "contact_types" ("userId", "name")`,
    );

    // Create contact_notes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contactId" uuid NOT NULL,
        "content" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_notes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contact_notes_contactId" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contact_notes_contactId" ON "contact_notes" ("contactId")`,
    );

    // Create contact_custom_fields table (field definitions per user)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_custom_fields" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "fieldName" varchar NOT NULL,
        "fieldType" varchar NOT NULL DEFAULT 'text',
        "options" text NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_custom_fields" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_contact_custom_fields_userId_fieldName" ON "contact_custom_fields" ("userId", "fieldName")`,
    );

    // Create contact_custom_field_values table (values per contact per field)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_custom_field_values" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contactId" uuid NOT NULL,
        "fieldId" uuid NOT NULL,
        "value" text NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_custom_field_values" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ccfv_contactId" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ccfv_fieldId" FOREIGN KEY ("fieldId") REFERENCES "contact_custom_fields"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ccfv_contactId_fieldId" ON "contact_custom_field_values" ("contactId", "fieldId")`,
    );

    // Create deal_stages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deal_stages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "name" varchar NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "color" varchar NULL,
        "isWon" boolean NOT NULL DEFAULT false,
        "isLost" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deal_stages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_deal_stages_userId_name" ON "deal_stages" ("userId", "name")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_deal_stages_userId_sortOrder" ON "deal_stages" ("userId", "sortOrder")`,
    );

    // Create deals table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "deals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" varchar NOT NULL,
        "contactId" uuid NULL,
        "stageId" uuid NULL,
        "title" text NOT NULL,
        "details" text NULL,
        "value" decimal(12,2) NULL,
        "currency" varchar NULL DEFAULT 'USD',
        "expectedCloseDate" TIMESTAMP NULL,
        "metadata" text NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_deals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deals_contactId" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_deals_stageId" FOREIGN KEY ("stageId") REFERENCES "deal_stages"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_deals_userId_stageId" ON "deals" ("userId", "stageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_deals_userId_contactId" ON "deals" ("userId", "contactId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "deals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deal_stages"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "contact_custom_field_values"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_custom_fields"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_types"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_contacts_userId_contactType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "followUpDate"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "contactTypeAutoDetected"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN IF EXISTS "contactType"`,
    );
  }
}
