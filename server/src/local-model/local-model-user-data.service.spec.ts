import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { LocalModelUserDataService } from "./local-model-user-data.service";

const USER_ID = "user-1";

async function makeService(
  env: Record<string, string>,
  send: jest.Mock,
): Promise<LocalModelUserDataService> {
  jest.spyOn(S3Client.prototype, "send").mockImplementation(send);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LocalModelUserDataService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
    ],
  }).compile();
  return module.get(LocalModelUserDataService);
}

function deletedKeys(send: jest.Mock): string[] {
  return send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof DeleteObjectsCommand)
    .flatMap((command: DeleteObjectsCommand) =>
      (command.input.Delete?.Objects ?? []).map((object) => object.Key),
    );
}

describe("LocalModelUserDataService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("does nothing when the models bucket isn't configured", async () => {
    const send = jest.fn();
    const service = await makeService({}, send);

    await expect(service.deleteUserData(USER_ID)).resolves.toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("deletes the training export, the legacy model and every versioned bundle", async () => {
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof ListObjectsV2Command) {
        return command.input.ContinuationToken
          ? { Contents: [{ Key: "models/user-1/current.json" }] }
          : {
              Contents: [{ Key: "models/user-1/20261101T000000Z.joblib" }],
              IsTruncated: true,
              NextContinuationToken: "page-2",
            };
      }
      return {};
    });
    const service = await makeService({ LOCAL_MODELS_BUCKET: "bucket" }, send);

    await expect(service.deleteUserData(USER_ID)).resolves.toBe(4);

    const listCall = send.mock.calls.find(
      ([command]) => command instanceof ListObjectsV2Command,
    );
    expect(listCall?.[0].input.Prefix).toBe("models/user-1/");
    expect(deletedKeys(send)).toEqual([
      "training-data/user-1.json",
      "models/user-1.joblib",
      "models/user-1/20261101T000000Z.joblib",
      "models/user-1/current.json",
    ]);
  });

  it("throws when S3 reports objects it couldn't delete", async () => {
    const send = jest.fn(async (command: unknown) =>
      command instanceof DeleteObjectsCommand
        ? {
            Errors: [
              { Key: "training-data/user-1.json", Code: "AccessDenied" },
            ],
          }
        : { Contents: [] },
    );
    const service = await makeService({ LOCAL_MODELS_BUCKET: "bucket" }, send);

    await expect(service.deleteUserData(USER_ID)).rejects.toThrow(
      "training-data/user-1.json (AccessDenied)",
    );
  });
});
