import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { S3Client } from "@aws-sdk/client-s3";

import { EmailExportService } from "../emails/email-export.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { LocalModelTrainingDataService } from "./local-model-training-data.service";

function makeExportService(recordCount: number): Partial<EmailExportService> {
  return {
    async *streamExportableRecords() {
      for (let i = 0; i < recordCount; i++) {
        yield { subject: `s${i}` } as never;
      }
    },
  };
}

const encryption = {
  withUserKey: <T>(_userId: string, task: () => Promise<T>) => task(),
} as unknown as UserEncryptionService;

async function makeService(
  env: Record<string, string>,
  recordCount: number,
  send: jest.Mock,
): Promise<LocalModelTrainingDataService> {
  jest.spyOn(S3Client.prototype, "send").mockImplementation(send);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LocalModelTrainingDataService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      { provide: EmailExportService, useValue: makeExportService(recordCount) },
      { provide: UserEncryptionService, useValue: encryption },
    ],
  }).compile();
  return module.get(LocalModelTrainingDataService);
}

describe("LocalModelTrainingDataService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is a no-op when the bucket isn't configured", async () => {
    const send = jest.fn();
    const service = await makeService({}, 500, send);
    const result = await service.exportUserTrainingData("u1");
    expect(result).toMatchObject({ uploaded: false, reason: "no_bucket" });
    expect(send).not.toHaveBeenCalled();
  });

  it("skips users with too few records (no upload)", async () => {
    const send = jest.fn();
    const service = await makeService(
      { LOCAL_MODELS_BUCKET: "bucket" },
      10,
      send,
    );
    const result = await service.exportUserTrainingData("u1");
    expect(result).toMatchObject({
      uploaded: false,
      reason: "too_few_records",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("uploads the records to training-data/<userId>.json when there are enough", async () => {
    const send = jest.fn().mockResolvedValue({});
    const service = await makeService(
      { LOCAL_MODELS_BUCKET: "bucket" },
      500,
      send,
    );
    const result = await service.exportUserTrainingData("user-42");

    expect(result).toMatchObject({ uploaded: true, recordCount: 500 });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input.Bucket).toBe("bucket");
    expect(command.input.Key).toBe("training-data/user-42.json");
    expect(JSON.parse(command.input.Body)).toHaveLength(500);
  });
});
