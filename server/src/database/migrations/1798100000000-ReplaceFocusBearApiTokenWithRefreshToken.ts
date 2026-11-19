import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

const TABLE = "users";
const PASTED_TOKEN_COLUMN = "focusBearApiToken";
const REFRESH_TOKEN_COLUMN = "focusBearRefreshToken";

/**
 * Focus Bear is now connected by signing in (OAuth), not by pasting an access token. The pasted
 * tokens can't be turned into a sign-in, so they are dropped and those users connect again.
 */
export class ReplaceFocusBearApiTokenWithRefreshToken1798100000000 implements MigrationInterface {
  name = "ReplaceFocusBearApiTokenWithRefreshToken1798100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceColumn(
      queryRunner,
      PASTED_TOKEN_COLUMN,
      REFRESH_TOKEN_COLUMN,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceColumn(
      queryRunner,
      REFRESH_TOKEN_COLUMN,
      PASTED_TOKEN_COLUMN,
    );
  }

  private async replaceColumn(
    queryRunner: QueryRunner,
    from: string,
    to: string,
  ): Promise<void> {
    const usersTable = await queryRunner.getTable(TABLE);
    if (usersTable?.findColumnByName(from)) {
      await queryRunner.dropColumn(TABLE, from);
    }
    if (!usersTable?.findColumnByName(to)) {
      await queryRunner.addColumn(
        TABLE,
        new TableColumn({ name: to, type: "text", isNullable: true }),
      );
    }
  }
}
