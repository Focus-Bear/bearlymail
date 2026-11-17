import { BadRequestException, NotFoundException } from "@nestjs/common";

import {
  findUserAiProvider,
  USER_AI_PROVIDERS,
} from "../constants/user-ai-providers.constants";
import { validateUserAiKey } from "./user-ai-key-validator";
import { UserAiKeysController } from "./user-ai-keys.controller";
import type {
  UserAiKeysService,
  UserAiKeyStatus,
} from "./user-ai-keys.service";

jest.mock("./user-ai-key-validator", () => ({
  validateUserAiKey: jest.fn(),
}));

const USER_ID = "user-1";
const REQUEST = { user: { userId: USER_ID } };
const RAW_KEY = "sk-ant-api03-very-secret-key-wxyz";
const STATUSES: UserAiKeyStatus[] = [
  {
    provider: USER_AI_PROVIDERS.ANTHROPIC,
    hasKey: true,
    maskedKey: "sk-ant-••••wxyz",
    rejectedAt: null,
  },
];

describe("UserAiKeysController", () => {
  const userAiKeys = {
    findStatuses: jest.fn().mockResolvedValue(STATUSES),
    setKey: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new UserAiKeysController(
    userAiKeys as unknown as UserAiKeysService,
  );

  beforeEach(() => jest.clearAllMocks());

  it("validates and stores a key, answering with masked statuses only", async () => {
    jest.mocked(validateUserAiKey).mockResolvedValue({ valid: true });

    const result = await controller.save(REQUEST, USER_AI_PROVIDERS.ANTHROPIC, {
      key: `  ${RAW_KEY} `,
    });

    expect(userAiKeys.setKey).toHaveBeenCalledWith(
      USER_ID,
      findUserAiProvider(USER_AI_PROVIDERS.ANTHROPIC),
      RAW_KEY,
    );
    expect(JSON.stringify(result)).not.toContain(RAW_KEY);
    expect(result.providers).toEqual(STATUSES);
  });

  it("refuses a key the provider rejects without storing it", async () => {
    jest
      .mocked(validateUserAiKey)
      .mockResolvedValue({ valid: false, error: "Anthropic rejected it" });

    await expect(
      controller.save(REQUEST, USER_AI_PROVIDERS.ANTHROPIC, { key: RAW_KEY }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userAiKeys.setKey).not.toHaveBeenCalled();
  });

  it("rejects unknown providers", async () => {
    await expect(
      controller.save(REQUEST, "gemini", { key: RAW_KEY }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.remove(REQUEST, "gemini")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("removes a key by clearing it", async () => {
    await controller.remove(REQUEST, USER_AI_PROVIDERS.TYPESAFE);

    expect(userAiKeys.setKey).toHaveBeenCalledWith(
      USER_ID,
      findUserAiProvider(USER_AI_PROVIDERS.TYPESAFE),
      null,
    );
  });
});
