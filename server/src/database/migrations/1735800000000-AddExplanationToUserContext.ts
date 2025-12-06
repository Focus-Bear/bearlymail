import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddExplanationToUserContext1735800000000 implements MigrationInterface {
    name = 'AddExplanationToUserContext1735800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add explanation column to store the rationale/explanation for context items
        await queryRunner.addColumn('user_contexts', new TableColumn({
            name: 'explanation',
            type: 'text',
            isNullable: true,
            default: null,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('user_contexts', 'explanation');
    }
}

