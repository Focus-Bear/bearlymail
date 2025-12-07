import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPriorityExplanationToEmail1736300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add priorityExplanation column to emails table
    await queryRunner.addColumn(
      'emails',
      new TableColumn({
        name: 'priorityExplanation',
        type: 'text',
        isNullable: true,
      })
    );

    // Add comment to explain the column stores JSON
    await queryRunner.query(`
      COMMENT ON COLUMN "emails"."priorityExplanation" IS 'Precomputed priority explanation as JSON (encrypted)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('emails', 'priorityExplanation');
  }
}


