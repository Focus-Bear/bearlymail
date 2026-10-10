import { Logger } from "@nestjs/common";

import { LLMProvider } from "./llm.types";
import {
  NOVA_ESCALATION_FALLBACK_PROVIDER,
  NOVA_ESCALATION_PRIMARY_PROVIDER,
  runWithNovaEscalation,
} from "./llm-nova-escalation";

const logger = {
  log: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger;

interface FakeResult {
  phrases: string[];
}

const isEmpty = (result: FakeResult): boolean => result.phrases.length === 0;

describe("runWithNovaEscalation", () => {
  afterEach(() => jest.clearAllMocks());

  it("runs Bedrock first and Gemini as the fallback", () => {
    expect(NOVA_ESCALATION_PRIMARY_PROVIDER).toBe(LLMProvider.BEDROCK);
    expect(NOVA_ESCALATION_FALLBACK_PROVIDER).toBe(LLMProvider.GEMINI);
  });

  it("returns the Nova result without calling Gemini when it is usable", async () => {
    const run = jest.fn().mockResolvedValue({ phrases: ["QA Passed"] });

    const result = await runWithNovaEscalation<FakeResult>({
      label: "[TEST]",
      logger,
      run,
      needsEscalation: isEmpty,
    });

    expect(result).toEqual({ phrases: ["QA Passed"] });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(LLMProvider.BEDROCK);
  });

  it("escalates to Gemini when Nova returns null (failed / unparseable)", async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ phrases: ["pull request"] });

    const result = await runWithNovaEscalation<FakeResult>({
      label: "[TEST]",
      logger,
      run,
    });

    expect(result).toEqual({ phrases: ["pull request"] });
    expect(run).toHaveBeenNthCalledWith(1, LLMProvider.BEDROCK);
    expect(run).toHaveBeenNthCalledWith(2, LLMProvider.GEMINI);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("escalated to gemini (bedrock failed)"),
    );
  });

  it("escalates to Gemini when the predicate flags the Nova result as weak", async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ phrases: [] })
      .mockResolvedValueOnce({ phrases: ["build failed"] });

    const result = await runWithNovaEscalation<FakeResult>({
      label: "[TEST]",
      logger,
      run,
      needsEscalation: isEmpty,
    });

    expect(result).toEqual({ phrases: ["build failed"] });
    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("escalated to gemini (bedrock weak)"),
    );
  });

  it("keeps the weak Nova result when Gemini fails", async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ phrases: [] })
      .mockResolvedValueOnce(null);

    const result = await runWithNovaEscalation<FakeResult>({
      label: "[TEST]",
      logger,
      run,
      needsEscalation: isEmpty,
    });

    expect(result).toEqual({ phrases: [] });
    expect(logger.log).not.toHaveBeenCalled();
  });

  it("treats a thrown error as a failed attempt and returns null when both providers throw", async () => {
    const run = jest.fn().mockRejectedValue(new Error("boom"));

    const result = await runWithNovaEscalation<FakeResult>({
      label: "[TEST]",
      logger,
      run,
    });

    expect(result).toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("bedrock attempt threw: boom"),
    );
  });
});
