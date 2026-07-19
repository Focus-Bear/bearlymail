import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddFollowUpGenerationFields1766114688000 implements MigrationInterface {
  name = "AddFollowUpGenerationFields1766114688000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const followUpsTable = await queryRunner.getTable("follow_ups");

    if (followUpsTable) {
      // Add generation status fields
      const hasGenerationStatus =
        followUpsTable.findColumnByName("generationStatus");
      if (!hasGenerationStatus) {
        await queryRunner.addColumn(
          "follow_ups",
          new TableColumn({
            name: "generationStatus",
            type: "varchar",
            isNullable: true,
          }),
        );
      }

      const hasGenerationError =
        followUpsTable.findColumnByName("generationError");
      if (!hasGenerationError) {
        await queryRunner.addColumn(
          "follow_ups",
          new TableColumn({
            name: "generationError",
            type: "text",
            isNullable: true,
          }),
        );
      }

      const hasGeneratedAt = followUpsTable.findColumnByName("generatedAt");
      if (!hasGeneratedAt) {
        await queryRunner.addColumn(
          "follow_ups",
          new TableColumn({
            name: "generatedAt",
            type: "timestamp",
            isNullable: true,
          }),
        );
      }

      // Add send status fields
      const hasSendStatus = followUpsTable.findColumnByName("sendStatus");
      if (!hasSendStatus) {
        await queryRunner.addColumn(
          "follow_ups",
          new TableColumn({
            name: "sendStatus",
            type: "varchar",
            isNullable: true,
          }),
        );
      }

      const hasSendError = followUpsTable.findColumnByName("sendError");
      if (!hasSendError) {
        await queryRunner.addColumn(
          "follow_ups",
          new TableColumn({
            name: "sendError",
            type: "text",
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const followUpsTable = await queryRunner.getTable("follow_ups");

    if (followUpsTable) {
      const hasGenerationStatus =
        followUpsTable.findColumnByName("generationStatus");
      if (hasGenerationStatus) {
        await queryRunner.dropColumn("follow_ups", "generationStatus");
      }

      const hasGenerationError =
        followUpsTable.findColumnByName("generationError");
      if (hasGenerationError) {
        await queryRunner.dropColumn("follow_ups", "generationError");
      }

      const hasGeneratedAt = followUpsTable.findColumnByName("generatedAt");
      if (hasGeneratedAt) {
        await queryRunner.dropColumn("follow_ups", "generatedAt");
      }

      const hasSendStatus = followUpsTable.findColumnByName("sendStatus");
      if (hasSendStatus) {
        await queryRunner.dropColumn("follow_ups", "sendStatus");
      }

      const hasSendError = followUpsTable.findColumnByName("sendError");
      if (hasSendError) {
        await queryRunner.dropColumn("follow_ups", "sendError");
      }
    }
  }
}
