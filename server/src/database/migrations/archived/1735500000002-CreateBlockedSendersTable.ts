import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateBlockedSendersTable1735500000002
  implements MigrationInterface
{
  name = "CreateBlockedSendersTable1735500000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable("blocked_senders");
    if (tableExists) {
      console.log('Table "blocked_senders" already exists, skipping creation');
      return;
    }

    await queryRunner.createTable(
      new Table({
        name: "blocked_senders",
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
            name: "email",
            type: "text",
            comment: "Encrypted email address",
          },
          {
            name: "emailHash",
            type: "varchar",
            length: "64",
            comment: "SHA-256 hash for fast lookups",
          },
          {
            name: "domainHash",
            type: "varchar",
            length: "64",
            isNullable: true,
            comment: "SHA-256 hash of domain for domain-level blocking",
          },
          {
            name: "reason",
            type: "text",
            isNullable: true,
            comment: "Encrypted reason for blocking",
          },
          {
            name: "senderName",
            type: "text",
            isNullable: true,
            comment: "Encrypted sender name for display",
          },
          {
            name: "blockedAt",
            type: "timestamp",
            default: "now()",
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

    // Unique index: one block per email per user
    await queryRunner.createIndex(
      "blocked_senders",
      new TableIndex({
        name: "IDX_blocked_senders_userId_emailHash",
        columnNames: ["userId", "emailHash"],
        isUnique: true,
      }),
    );

    // Index for domain-level blocking
    await queryRunner.createIndex(
      "blocked_senders",
      new TableIndex({
        name: "IDX_blocked_senders_userId_domainHash",
        columnNames: ["userId", "domainHash"],
        where: '"domainHash" IS NOT NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("blocked_senders");
  }
}
