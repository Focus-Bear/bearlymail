import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const TABLE = "users";
const COLUMN = "focusBearApiToken";

export class AddFocusBearApiTokenToUsers1797770000000
  implements MigrationInterface
{
  name = "AddFocusBearApiTokenToUsers1797770000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable(TABLE);
    if (usersTable?.findColumnByName(COLUMN)) {
      return;
    }
    await queryRunner.addColumn(
      TABLE,
      new TableColumn({ name: COLUMN, type: "text", isNullable: true }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable(TABLE);
    if (usersTable?.findColumnByName(COLUMN)) {
      await queryRunner.dropColumn(TABLE, COLUMN);
    }
  }
}
