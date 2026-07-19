import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMeetingProposalToEmailThread1791100000000
  implements MigrationInterface
{
  name = "AddMeetingProposalToEmailThread1791100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ADD "meetingProposal" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" DROP COLUMN "meetingProposal"`,
    );
  }
}
