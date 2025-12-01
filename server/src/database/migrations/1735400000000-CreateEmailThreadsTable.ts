import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class CreateEmailThreadsTable1735400000000 implements MigrationInterface {
  name = 'CreateEmailThreadsTable1735400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create email_threads table
    await queryRunner.createTable(
      new Table({
        name: 'email_threads',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'threadId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'starCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'isArchived',
            type: 'boolean',
            default: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create unique index on userId + threadId
    await queryRunner.createIndex(
      'email_threads',
      new TableIndex({
        name: 'IDX_email_threads_userId_threadId',
        columnNames: ['userId', 'threadId'],
        isUnique: true,
      }),
    );

    // Create indexes for filtering
    await queryRunner.createIndex(
      'email_threads',
      new TableIndex({
        name: 'IDX_email_threads_userId_starCount_isArchived',
        columnNames: ['userId', 'starCount', 'isArchived'],
      }),
    );

    await queryRunner.createIndex(
      'email_threads',
      new TableIndex({
        name: 'IDX_email_threads_userId_isArchived_starCount',
        columnNames: ['userId', 'isArchived', 'starCount'],
      }),
    );

    // Add emailThreadId column to emails table
    await queryRunner.addColumn(
      'emails',
      new TableColumn({
        name: 'emailThreadId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Migrate existing data: Create email_threads records from existing emails
    // Group by userId + threadId, take max starCount and any isArchived = true
    await queryRunner.query(`
      INSERT INTO email_threads ("id", "userId", "threadId", "starCount", "isArchived", "createdAt", "updatedAt")
      SELECT 
        uuid_generate_v4() as id,
        "userId",
        "threadId",
        MAX("starCount") as "starCount",
        BOOL_OR("isArchived") as "isArchived",
        MIN("receivedAt") as "createdAt",
        NOW() as "updatedAt"
      FROM emails
      GROUP BY "userId", "threadId"
    `);

    // Update emails table to link to email_threads
    await queryRunner.query(`
      UPDATE emails e
      SET "emailThreadId" = et.id
      FROM email_threads et
      WHERE e."userId" = et."userId" 
        AND e."threadId" = et."threadId"
    `);

    // Create foreign key
    await queryRunner.createForeignKey(
      'emails',
      new TableForeignKey({
        columnNames: ['emailThreadId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'email_threads',
        onDelete: 'CASCADE',
      }),
    );

    // Create index on emailThreadId for joins
    await queryRunner.createIndex(
      'emails',
      new TableIndex({
        name: 'IDX_emails_emailThreadId',
        columnNames: ['emailThreadId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key
    const table = await queryRunner.getTable('emails');
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('emailThreadId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey('emails', foreignKey);
    }

    // Remove index
    await queryRunner.dropIndex('emails', 'IDX_emails_emailThreadId');

    // Remove emailThreadId column
    await queryRunner.dropColumn('emails', 'emailThreadId');

    // Drop email_threads table
    await queryRunner.dropTable('email_threads');
  }
}

