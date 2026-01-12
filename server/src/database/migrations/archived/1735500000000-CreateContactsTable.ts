import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateContactsTable1735500000000 implements MigrationInterface {
  name = "CreateContactsTable1735500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable("contacts");
    if (tableExists) {
      // eslint-disable-next-line no-console
      console.log('Table "contacts" already exists, skipping creation');
      return;
    }

    // Create contacts table
    await queryRunner.createTable(
      new Table({
        name: "contacts",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "userId",
            type: "uuid",
          },
          {
            name: "provider",
            type: "varchar",
            default: "'manual'",
          },
          {
            name: "providerId",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "email",
            type: "text",
            comment: "Encrypted email address",
          },
          {
            name: "name",
            type: "text",
            isNullable: true,
            comment: "Encrypted full name",
          },
          {
            name: "firstName",
            type: "text",
            isNullable: true,
            comment: "Encrypted first name",
          },
          {
            name: "lastName",
            type: "text",
            isNullable: true,
            comment: "Encrypted last name",
          },
          {
            name: "phone",
            type: "text",
            isNullable: true,
            comment: "Encrypted phone number",
          },
          {
            name: "company",
            type: "text",
            isNullable: true,
            comment: "Encrypted company name",
          },
          {
            name: "jobTitle",
            type: "text",
            isNullable: true,
            comment: "Encrypted job title",
          },
          {
            name: "photoUrl",
            type: "text",
            isNullable: true,
            comment: "Encrypted photo URL",
          },
          {
            name: "emailHash",
            type: "varchar",
            length: "64",
            comment: "SHA-256 hash of normalized email for exact matching",
          },
          {
            name: "searchTokens",
            type: "text",
            isNullable: true,
            comment: "JSON array of hashed search tokens for fuzzy matching",
          },
          {
            name: "isFavorite",
            type: "boolean",
            default: false,
          },
          {
            name: "lastContactedAt",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "contactFrequency",
            type: "int",
            default: 0,
            comment: "How often user emails this contact",
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "updatedAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "lastSyncedAt",
            type: "timestamp",
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ["userId"],
            referencedColumnNames: ["id"],
            referencedTableName: "users",
            onDelete: "CASCADE",
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      "contacts",
      new TableIndex({
        name: "IDX_contacts_userId_emailHash",
        columnNames: ["userId", "emailHash"],
      }),
    );

    await queryRunner.createIndex(
      "contacts",
      new TableIndex({
        name: "IDX_contacts_userId_provider_providerId",
        columnNames: ["userId", "provider", "providerId"],
        isUnique: true,
        where: '"providerId" IS NOT NULL',
      }),
    );

    await queryRunner.createIndex(
      "contacts",
      new TableIndex({
        name: "IDX_contacts_emailHash",
        columnNames: ["emailHash"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("contacts");
  }
}
