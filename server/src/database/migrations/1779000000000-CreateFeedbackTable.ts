import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateFeedbackTable1779000000000 implements MigrationInterface {
  name = "CreateFeedbackTable1779000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "feedback",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "userEmailEncrypted",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "message",
            type: "text",
          },
          {
            name: "screenshotS3Key",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "appVersion",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "userAgent",
            type: "varchar",
            isNullable: true,
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("feedback");
  }
}
