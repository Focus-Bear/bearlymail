import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUpdatedAtToUsers1735300000000 implements MigrationInterface {
  name = 'AddUpdatedAtToUsers1735300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column already exists
    const table = await queryRunner.getTable('users');
    const hasUpdatedAt = table?.findColumnByName('updatedAt');

    if (!hasUpdatedAt) {
      // Add updatedAt column with default to current timestamp for existing rows
      // TypeORM's @UpdateDateColumn() decorator will handle automatic updates
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'updatedAt',
          type: 'timestamp',
          default: 'CURRENT_TIMESTAMP',
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove updatedAt column
    await queryRunner.dropColumn('users', 'updatedAt');
  }
}

