import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddEmailPerformanceIndexes1735272000000 implements MigrationInterface {
  name = 'AddEmailPerformanceIndexes1735272000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index for inbox filtering by userId, starCount, isArchived, isSnoozed
    await queryRunner.createIndex(
      'emails',
      new TableIndex({
        name: 'IDX_emails_userId_starCount_isArchived_isSnoozed',
        columnNames: ['userId', 'starCount', 'isArchived', 'isSnoozed'],
      }),
    );

    // Composite index for triage/process filtering by userId, isArchived, starCount, isSnoozed, isBatched
    await queryRunner.createIndex(
      'emails',
      new TableIndex({
        name: 'IDX_emails_userId_isArchived_starCount_isSnoozed_isBatched',
        columnNames: ['userId', 'isArchived', 'starCount', 'isSnoozed', 'isBatched'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    await queryRunner.dropIndex(
      'emails',
      'IDX_emails_userId_isArchived_starCount_isSnoozed_isBatched',
    );

    await queryRunner.dropIndex(
      'emails',
      'IDX_emails_userId_starCount_isArchived_isSnoozed',
    );
  }
}


