import { classifyBatchError } from "./context-batch-analysis.helpers";

describe("classifyBatchError", () => {
  it("classifies rate limit errors", () => {
    expect(classifyBatchError(new Error("rate limit exceeded"))).toBe(
      "rate_limit",
    );
    expect(classifyBatchError(new Error("HTTP 429 Too Many Requests"))).toBe(
      "rate_limit",
    );
    expect(classifyBatchError("429 error")).toBe("rate_limit");
  });

  it("classifies timeout errors", () => {
    expect(classifyBatchError(new Error("Request timeout"))).toBe("timeout");
    expect(classifyBatchError(new Error("ETIMEDOUT"))).toBe("timeout");
  });

  it("classifies token limit errors", () => {
    expect(classifyBatchError(new Error("token limit exceeded"))).toBe(
      "token_limit",
    );
  });

  it("classifies parse errors", () => {
    expect(classifyBatchError(new Error("failed to parse response"))).toBe(
      "parse_error",
    );
    expect(classifyBatchError("JSON parse failed")).toBe("parse_error");
  });

  it("classifies network errors", () => {
    expect(classifyBatchError(new Error("ECONNREFUSED 127.0.0.1:8080"))).toBe(
      "network_error",
    );
    expect(classifyBatchError(new Error("ENOTFOUND api.openai.com"))).toBe(
      "network_error",
    );
  });

  it("returns unknown for unrecognised errors", () => {
    expect(classifyBatchError(new Error("something went wrong"))).toBe(
      "unknown",
    );
    expect(classifyBatchError(null)).toBe("unknown");
    expect(classifyBatchError({ code: 429 })).toBe("unknown");
  });
});
