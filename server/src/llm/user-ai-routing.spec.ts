import { HttpStatus } from "@nestjs/common";

import { USER_AI_PROVIDERS } from "../constants/user-ai-providers.constants";
import { LLMProvider } from "./llm.types";
import { maskKey } from "./user-ai-keys.service";
import {
  isAuthFailure,
  planOwnProviderAttempts,
  selectJevCredentials,
  UserAiKeyRejectedException,
  usesOwnAiAccount,
} from "./user-ai-routing";

const OPENAI_KEY = "sk-user-openai";
const ANTHROPIC_KEY = "sk-ant-user";
const JEV_KEY = "user-jev";
const SYSTEM_JEV_KEY = "system-jev";

describe("usesOwnAiAccount", () => {
  it("is true once the user has a generative key", () => {
    expect(usesOwnAiAccount({ openai: OPENAI_KEY })).toBe(true);
    expect(usesOwnAiAccount({ anthropic: ANTHROPIC_KEY })).toBe(true);
  });

  it("is false with no keys or only a TypeSafe key", () => {
    expect(usesOwnAiAccount({})).toBe(false);
    expect(usesOwnAiAccount({ typesafe: JEV_KEY })).toBe(false);
  });
});

describe("planOwnProviderAttempts", () => {
  const bothKeys = { openai: OPENAI_KEY, anthropic: ANTHROPIC_KEY };

  it("tries the requested provider first and keeps its model", () => {
    const attempts = planOwnProviderAttempts(
      bothKeys,
      LLMProvider.ANTHROPIC,
      "claude-x",
    );
    expect(attempts.map((attempt) => attempt.provider)).toEqual([
      LLMProvider.ANTHROPIC,
      LLMProvider.OPENAI,
    ]);
    expect(attempts[0].model).toBe("claude-x");
    expect(attempts[1].model).toBeUndefined();
  });

  it("moves a BearlyMail-account provider onto the user's providers in preference order, dropping its model", () => {
    const attempts = planOwnProviderAttempts(
      bothKeys,
      LLMProvider.GEMINI,
      "gemini-3.1-flash-lite",
    );
    expect(attempts).toEqual([
      expect.objectContaining({
        provider: LLMProvider.OPENAI,
        apiKey: OPENAI_KEY,
        model: undefined,
      }),
      expect.objectContaining({
        provider: LLMProvider.ANTHROPIC,
        apiKey: ANTHROPIC_KEY,
        model: undefined,
      }),
    ]);
  });

  it("never plans a TypeSafe attempt (Jev cannot generate text)", () => {
    expect(
      planOwnProviderAttempts({ typesafe: JEV_KEY }, undefined, undefined),
    ).toEqual([]);
  });
});

describe("selectJevCredentials", () => {
  const onRejected = jest.fn();

  it("prefers the user's own TypeSafe key", () => {
    expect(
      selectJevCredentials({ typesafe: JEV_KEY }, SYSTEM_JEV_KEY, onRejected),
    ).toEqual({ apiKey: JEV_KEY, onRejected });
  });

  it("skips Jev for a user on their own account without a TypeSafe key", () => {
    expect(
      selectJevCredentials({ openai: OPENAI_KEY }, SYSTEM_JEV_KEY, onRejected),
    ).toBeNull();
  });

  it("uses BearlyMail's key for everyone else, when configured", () => {
    expect(selectJevCredentials({}, SYSTEM_JEV_KEY, onRejected)).toEqual({
      apiKey: SYSTEM_JEV_KEY,
    });
    expect(selectJevCredentials({}, undefined, onRejected)).toBeNull();
  });
});

describe("isAuthFailure", () => {
  it.each([401, 403])("treats HTTP %s as a refused key", (status) => {
    expect(isAuthFailure({ status })).toBe(true);
  });

  it.each([400, 429, 500, undefined])("ignores HTTP %s", (status) => {
    expect(isAuthFailure({ status })).toBe(false);
  });
});

describe("UserAiKeyRejectedException", () => {
  it("is a 424, never a 401 that would log the user out", () => {
    const exception = new UserAiKeyRejectedException(
      USER_AI_PROVIDERS.ANTHROPIC,
    );
    expect(exception.getStatus()).toBe(HttpStatus.FAILED_DEPENDENCY);
    expect(exception.message).toContain("Anthropic");
  });
});

describe("maskKey", () => {
  it("shows only the prefix and last four characters", () => {
    expect(
      maskKey("sk-ant-api03-secretsecret-wxyz", { keyPrefix: "sk-ant-" }),
    ).toBe("sk-ant-••••wxyz");
    expect(maskKey("typesafe-secret-1234", {})).toBe("••••1234");
  });
});
