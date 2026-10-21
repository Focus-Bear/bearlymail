import { estimateCostUsd } from "./llm-pricing.constants";

describe("estimateCostUsd", () => {
  it("prices gemini flash-lite input/output per million", () => {
    // 1M prompt @ $0.25 + 1M completion @ $1.50
    expect(
      estimateCostUsd("gemini", "gemini-3.1-flash-lite", 1_000_000, 1_000_000),
    ).toBeCloseTo(1.75, 6);
  });

  it("longest prefix wins: flash-lite is not swallowed by the flash entry", () => {
    const lite = estimateCostUsd(
      "gemini",
      "gemini-3.1-flash-lite-preview",
      1_000_000,
      0,
    );
    const flash = estimateCostUsd("gemini", "gemini-3.1-flash", 1_000_000, 0);
    expect(lite).toBeCloseTo(0.25, 6);
    expect(flash).toBeCloseTo(0.5, 6);
  });

  it("matches versioned bedrock model ids by prefix", () => {
    expect(
      estimateCostUsd("bedrock", "amazon.nova-micro-v1:0", 1_000_000, 0),
    ).toBeCloseTo(0.035, 6);
  });

  it("prices Jev on input tokens only, for every jev version", () => {
    expect(
      estimateCostUsd("typesafe", "jev-1.13.0", 1_000_000, 1_000_000),
    ).toBeCloseTo(0.042, 6);
    expect(estimateCostUsd("typesafe", "jev-1.14.0", 1_000_000, 0)).toBeCloseTo(
      0.042,
      6,
    );
  });

  it("prices gemini-3.6-flash separately from gemini-3.5-flash", () => {
    expect(
      estimateCostUsd("gemini", "gemini-3.6-flash", 1_000_000, 1_000_000),
    ).toBeCloseTo(4.5, 6);
  });

  it("prices the category embedding model", () => {
    expect(
      estimateCostUsd("openai", "text-embedding-3-small", 1_000_000, 0),
    ).toBeCloseTo(0.02, 6);
  });

  it("claude-cli is free regardless of model string", () => {
    expect(estimateCostUsd("claude-cli", "claude-opus-4", 5_000_000, 1)).toBe(
      0,
    );
  });

  it("returns null for unknown providers and unknown models", () => {
    expect(estimateCostUsd("mystery", "model-x", 1000, 1000)).toBeNull();
    expect(estimateCostUsd("gemini", "gemini-99-ultra", 1000, 1000)).toBeNull();
  });

  it("is case-insensitive on provider", () => {
    expect(
      estimateCostUsd("GEMINI", "gemini-3.1-flash-lite", 1_000_000, 0),
    ).toBeCloseTo(0.25, 6);
  });
});
