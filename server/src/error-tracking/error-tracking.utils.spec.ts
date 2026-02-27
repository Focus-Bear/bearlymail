import { createPosthogExceptionPayload } from "./error-tracking.utils";

describe("createPosthogExceptionPayload", () => {
  it("includes platform to satisfy PostHog exception schema", () => {
    const error = new Error("boom");
    error.name = "TestError";

    const payload = createPosthogExceptionPayload(error, true);

    expect(payload.platform).toBe("node");
    expect(payload.type).toBe("TestError");
    expect(payload.value).toBe("boom");
  });
});
