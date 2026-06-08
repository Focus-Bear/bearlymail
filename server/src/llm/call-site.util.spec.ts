import { captureLlmCallSite } from "./call-site.util";

describe("captureLlmCallSite", () => {
  it("returns a non-empty frame that is not the util's own plumbing", () => {
    const site = captureLlmCallSite();
    expect(site.length).toBeGreaterThan(0);
    // Must skip its own frame and the LLM plumbing.
    expect(site).not.toContain("call-site.util.ts");
    expect(site).not.toContain("token-usage.service");
  });

  it("falls back to 'unknown' when there is no stack", () => {
    const original = Error.captureStackTrace;
    const spy = jest
      .spyOn(global, "Error")
      .mockImplementation(() => ({ stack: undefined }) as Error);
    try {
      expect(captureLlmCallSite()).toBe("unknown");
    } finally {
      spy.mockRestore();
      Error.captureStackTrace = original;
    }
  });
});
