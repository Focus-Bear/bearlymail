import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateContactGroups1790500000000 implements MigrationInterface {
  name = "CreateContactGroups1790500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_group" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "name" varchar NOT NULL,
        "nameHash" varchar NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_contact_group_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_contact_group_userId"
      ON "contact_group" ("userId")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_group_member" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" uuid NOT NULL,
        "contactId" uuid NOT NULL,
        "addedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_cgm_groupId"
          FOREIGN KEY ("groupId") REFERENCES "contact_group"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cgm_contactId"
          FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_contact_group_member_unique"
      ON "contact_group_member" ("groupId", "contactId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "contact_group_member" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "contact_group" CASCADE`);
  }
}
