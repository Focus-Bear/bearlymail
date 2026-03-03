import { ErrorTrackingService } from "./error-tracking.service";

describe("ErrorTrackingService", () => {
  let service: ErrorTrackingService;
  let mockCapture: jest.Mock;

  beforeEach(() => {
    // Enable PostHog by providing a fake API key
    process.env.POSTHOG_API_KEY = "test-api-key";

    service = new ErrorTrackingService();

    // Spy on the internal PostHog client's capture method
    mockCapture = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).posthog = { capture: mockCapture };
  });

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY;
    jest.restoreAllMocks();
  });

  describe("captureException", () => {
    it('includes platform: "node" in the PostHog exception payload', () => {
      const error = new Error("something went wrong");
      error.name = "TestError";

      service.captureException(error, "user-123");

      expect(mockCapture).toHaveBeenCalledTimes(1);
      const callArgs = mockCapture.mock.calls[0][0];
      expect(callArgs.properties.platform).toBe("node");
    });

    it("includes $exception_type and $exception_message in properties", () => {
      const error = new Error("boom");
      error.name = "BoomError";

      service.captureException(error);

      const callArgs = mockCapture.mock.calls[0][0];
      expect(callArgs.properties.$exception_type).toBe("BoomError");
      expect(callArgs.properties.$exception_message).toBe("boom");
    });
  });
});
