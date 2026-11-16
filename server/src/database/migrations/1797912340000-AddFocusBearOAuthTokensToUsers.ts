import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const TABLE = "users";

/** "Connect Focus Bear" sign-in: the refresh token, and the access token cached until it's due for renewal. */
const COLUMNS = [
  new TableColumn({
    name: "focusBearRefreshToken",
    type: "text",
    isNullable: true,
  }),
  new TableColumn({
    name: "focusBearAccessToken",
    type: "text",
    isNullable: true,
  }),
  new TableColumn({
    name: "focusBearAccessTokenRenewAt",
    type: "timestamptz",
    isNullable: true,
  }),
];

export class AddFocusBearOAuthTokensToUsers1797912340000
  implements MigrationInterface
{
  name = "AddFocusBearOAuthTokensToUsers1797912340000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable(TABLE);
    const missing = COLUMNS.filter(
      (column) => !usersTable?.findColumnByName(column.name),
    );
    if (missing.length > 0) {
      await queryRunner.addColumns(TABLE, missing);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const usersTable = await queryRunner.getTable(TABLE);
    const present = COLUMNS.filter((column) =>
      usersTable?.findColumnByName(column.name),
    );
    if (present.length > 0) {
      await queryRunner.dropColumns(TABLE, present);
    }
  }
}
