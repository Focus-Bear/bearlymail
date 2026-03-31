import { ErrorTrackingService } from "./error-tracking.service";

describe("ErrorTrackingService", () => {
  let service: ErrorTrackingService;
  let mockCaptureException: jest.Mock;

  beforeEach(() => {
    // Enable PostHog by providing a fake API key
    process.env.POSTHOG_API_KEY = "test-api-key";

    service = new ErrorTrackingService();

    // Spy on the internal PostHog client's captureException method
    // (not .capture — we must use the SDK's native captureException for $exception events)
    mockCaptureException = jest.fn();
    service.posthog = { captureException: mockCaptureException };
  });

  afterEach(() => {
    delete process.env.POSTHOG_API_KEY;
    jest.restoreAllMocks();
  });

  describe("captureException", () => {
    it("calls posthog.captureException() (not posthog.capture()) for $exception events", () => {
      const error = new Error("something went wrong");
      error.name = "TestError";

      service.captureException(error, "user-123");

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      // SDK signature: captureException(error, distinctId, additionalProperties)
      const [capturedError, distinctId] = mockCaptureException.mock.calls[0];
      expect(capturedError).toBe(error);
      expect(distinctId).toBe("user-123");
    });

    it("uses 'backend-errors' as distinctId when no userId is provided", () => {
      const error = new Error("boom");

      service.captureException(error);

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [, distinctId] = mockCaptureException.mock.calls[0];
      expect(distinctId).toBe("backend-errors");
    });

    it("passes environment and service in additionalProperties", () => {
      const error = new Error("ctx error");
      process.env.NODE_ENV = "test";

      service.captureException(error, "user-456", { tag: "batch" });

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      const [, , additionalProps] = mockCaptureException.mock.calls[0];
      expect(additionalProps).toMatchObject({
        environment: "test",
        service: "backend",
        tag: "batch",
      });
    });

    it("does not pass PII fields in additionalProperties", () => {
      const error = new Error("pii test");

      service.captureException(error, "user-789", {
        email: "secret@example.com",
        name: "Jane Doe",
        tag: "safe-tag",
      });

      const [, , additionalProps] = mockCaptureException.mock.calls[0];
      expect(additionalProps).not.toHaveProperty("email");
      expect(additionalProps).not.toHaveProperty("name");
      expect(additionalProps).toHaveProperty("tag", "safe-tag");
    });

    it("does nothing when PostHog is disabled", () => {
      service.isEnabled = false;
      service.posthog = null;

      service.captureException(new Error("silent"));

      expect(mockCaptureException).not.toHaveBeenCalled();
    });
  });
});
