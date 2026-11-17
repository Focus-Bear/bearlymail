import { EmailVerificationController } from "./email-verification.controller";
import { EmailVerificationService } from "./email-verification.service";

describe("EmailVerificationController", () => {
  const service = {
    verifyEmail: jest.fn().mockResolvedValue(undefined),
    resendVerification: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new EmailVerificationController(
    service as unknown as EmailVerificationService,
  );

  it("verifies the token", async () => {
    await expect(controller.verifyEmail({ token: "t" })).resolves.toEqual({
      verified: true,
    });
    expect(service.verifyEmail).toHaveBeenCalledWith("t");
  });

  it("answers resend the same way whether or not anything was sent", async () => {
    const result = await controller.resendVerification({
      email: "a@example.com",
    });
    expect(result.success).toBe(true);
    expect(service.resendVerification).toHaveBeenCalledWith("a@example.com");
  });
});
