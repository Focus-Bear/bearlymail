import { Test, TestingModule } from "@nestjs/testing";
import PgBoss from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UsersService } from "../users/users.service";
import { LocalModelTrainingDataProcessor } from "./local-model-training-data.processor";
import { LocalModelTrainingDataService } from "./local-model-training-data.service";

describe("LocalModelTrainingDataProcessor", () => {
  let processor: LocalModelTrainingDataProcessor;
  let boss: { schedule: jest.Mock; send: jest.Mock; work: jest.Mock };
  let trainingDataService: { isConfigured: jest.Mock };

  beforeEach(async () => {
    boss = {
      schedule: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue("job-id"),
      work: jest.fn().mockResolvedValue("worker-id"),
    };
    trainingDataService = { isConfigured: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocalModelTrainingDataProcessor,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: boss as unknown as PgBoss },
        { provide: UsersService, useValue: { findAll: jest.fn() } },
        {
          provide: LocalModelTrainingDataService,
          useValue: trainingDataService,
        },
      ],
    }).compile();

    processor = module.get(LocalModelTrainingDataProcessor);
  });

  it("does nothing when the models bucket is not configured", async () => {
    trainingDataService.isConfigured.mockReturnValue(false);

    await processor.onModuleInit();

    expect(boss.schedule).not.toHaveBeenCalled();
    expect(boss.send).not.toHaveBeenCalled();
  });

  it("schedules the weekly cron and registers both workers when configured", async () => {
    await processor.onModuleInit();

    expect(boss.schedule).toHaveBeenCalledWith(
      JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT,
      "0 4 * * 6",
    );
    expect(boss.work).toHaveBeenCalledWith(
      JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT,
      expect.anything(),
      expect.any(Function),
    );
    expect(boss.work).toHaveBeenCalledWith(
      JOB_NAMES.EXPORT_TRAINING_DATA,
      expect.anything(),
      expect.any(Function),
    );
  });

  it("bootstraps an export on startup with a singleton window", async () => {
    await processor.onModuleInit();

    expect(boss.send).toHaveBeenCalledWith(
      JOB_NAMES.SCHEDULE_TRAINING_DATA_EXPORT,
      {},
      expect.objectContaining({
        singletonKey: "schedule-training-data-export-bootstrap",
        singletonSeconds: expect.any(Number),
      }),
    );
  });
});
