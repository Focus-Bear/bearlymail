import { Logger } from "@nestjs/common";
import type { PgBoss } from "pg-boss";
import type { DataSource } from "typeorm";

import { PriorityBatchAnalysisRunner } from "../../emails/priority-batch-analysis-runner";
import { UserEncryptionService } from "../../encryption/user-encryption.service";
import { TokenUsageService } from "../../llm/token-usage.service";
import { composePriorityBatchRunner } from "./compose-priority-batch-runner";

describe("composePriorityBatchRunner", () => {
  it("builds the runner graph without a Nest container", () => {
    const getRepository = jest.fn(() => ({}));
    const composition = composePriorityBatchRunner({
      dataSource: { getRepository } as unknown as DataSource,
      boss: {} as PgBoss,
      logger: new Logger("test"),
      serialiseApply: (_userId, work) => work(),
    });

    expect(composition.runner).toBeInstanceOf(PriorityBatchAnalysisRunner);
    expect(composition.userEncryptionService).toBeInstanceOf(
      UserEncryptionService,
    );
    expect(composition.tokenUsageService).toBeInstanceOf(TokenUsageService);
    expect(getRepository).toHaveBeenCalled();
  });
});
