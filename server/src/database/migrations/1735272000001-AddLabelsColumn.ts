import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLabelsColumn1735272000001 implements MigrationInterface {
    name = 'AddLabelsColumn1735272000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "emails" ADD "labels" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "emails" DROP COLUMN "labels"`);
    }
}




