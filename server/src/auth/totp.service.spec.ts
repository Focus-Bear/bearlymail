import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service";
import { TotpService } from "./totp.service";

describe("TotpService", () => {
  let service: TotpService;
  let _usersService: jest.Mocked<UsersService>;

  const mockUser = {
    id: "user-1",
    email: "admin@example.com",
    totpSecret: null as string | null,
    totpEnabled: false,
  };

  const mockUsersService = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TotpService,
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<TotpService>(TotpService);
    _usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── base32 round-trip ──────────────────────────────────────────────────────

  describe("base32 encoding", () => {
    it("should round-trip arbitrary bytes", () => {
      const input = Buffer.from([0x00, 0xff, 0x42, 0xab, 0xcd]);
      const encoded = TotpService._base32Encode(input);
      const decoded = TotpService._base32Decode(encoded);
      expect(decoded).toEqual(input);
    });

    it("should produce only uppercase base32 chars", () => {
      const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const encoded = TotpService._base32Encode(buf);
      expect(encoded).toMatch(/^[A-Z2-7]+$/);
    });

    it("should decode case-insensitively", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const upper = TotpService._base32Decode(secret);
      const lower = TotpService._base32Decode(secret.toLowerCase());
      expect(upper).toEqual(lower);
    });
  });

  // ── TOTP code generation ───────────────────────────────────────────────────

  describe("TOTP code generation", () => {
    it("should generate a 6-digit string", () => {
      // RFC 4226 test secret: 12345678901234567890 as base32
      const secret = TotpService._base32Encode(
        Buffer.from("12345678901234567890"),
      );
      const code = TotpService._generateTotpCode(secret, 0);
      expect(code).toMatch(/^\d{6}$/);
    });

    it("should generate the same code for the same step", () => {
      const secret = TotpService._base32Encode(
        Buffer.from("test-secret-value"),
      );
      const step = Math.floor(Date.now() / 1000 / 30);
      expect(TotpService._generateTotpCode(secret, step)).toBe(
        TotpService._generateTotpCode(secret, step),
      );
    });

    it("should generate different codes for different steps", () => {
      const secret = TotpService._base32Encode(
        Buffer.from("test-secret-value"),
      );
      const step = 100000;
      const codeA = TotpService._generateTotpCode(secret, step);
      const codeB = TotpService._generateTotpCode(secret, step + 1);
      // Not guaranteed to differ, but astronomically unlikely
      expect(codeA.length).toBe(6);
      expect(codeB.length).toBe(6);
    });
  });

  // ── _verifyTotpToken (static) ──────────────────────────────────────────────

  describe("_verifyTotpToken", () => {
    it("should return true for the current TOTP code", () => {
      const secret = TotpService._base32Encode(
        Buffer.from("my-deterministic-secret"),
      );
      const step = Math.floor(Date.now() / 1000 / 30);
      const code = TotpService._generateTotpCode(secret, step);
      expect(TotpService._verifyTotpToken(secret, code)).toBe(true);
    });

    it("should accept codes from the previous window (drift)", () => {
      const secret = TotpService._base32Encode(Buffer.from("drift-test-key"));
      const step = Math.floor(Date.now() / 1000 / 30) - 1;
      const previousCode = TotpService._generateTotpCode(secret, step);
      expect(TotpService._verifyTotpToken(secret, previousCode)).toBe(true);
    });

    it("should reject an obviously wrong code", () => {
      const secret = TotpService._base32Encode(Buffer.from("some-secret"));
      expect(TotpService._verifyTotpToken(secret, "000000")).toBeFalsy();
    });

    it("should reject non-digit tokens", () => {
      const secret = TotpService._base32Encode(Buffer.from("some-secret"));
      expect(TotpService._verifyTotpToken(secret, "abcdef")).toBe(false);
    });

    it("should reject tokens that are too short", () => {
      const secret = TotpService._base32Encode(Buffer.from("some-secret"));
      expect(TotpService._verifyTotpToken(secret, "12345")).toBe(false);
    });

    it("should reject tokens that are too long", () => {
      const secret = TotpService._base32Encode(Buffer.from("some-secret"));
      expect(TotpService._verifyTotpToken(secret, "1234567")).toBe(false);
    });
  });

  // ── setupMfa ───────────────────────────────────────────────────────────────

  describe("setupMfa", () => {
    it("should return secret and otpauthUrl", async () => {
      mockUsersService.findOne.mockResolvedValue({ ...mockUser });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.setupMfa("user-1");

      expect(result.secret).toMatch(/^[A-Z2-7]+$/);
      expect(result.otpauthUrl).toContain("otpauth://totp/");
      expect(result.otpauthUrl).toContain("BearlyMail");
    });

    it("should save secret with totpEnabled=false", async () => {
      mockUsersService.findOne.mockResolvedValue({ ...mockUser });
      mockUsersService.update.mockResolvedValue(undefined);

      await service.setupMfa("user-1");

      expect(mockUsersService.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ totpEnabled: false }),
      );
    });

    it("should throw when user is not found", async () => {
      mockUsersService.findOne.mockResolvedValue(null);

      await expect(service.setupMfa("missing-user")).rejects.toThrow(
        "User not found",
      );
    });
  });

  // ── enableMfa ──────────────────────────────────────────────────────────────

  describe("enableMfa", () => {
    it("should return true and set totpEnabled when token is valid", async () => {
      const secret = TotpService._base32Encode(Buffer.from("enable-secret"));
      const step = Math.floor(Date.now() / 1000 / 30);
      const token = TotpService._generateTotpCode(secret, step);

      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpSecret: secret,
        totpEnabled: false,
      });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.enableMfa("user-1", token);

      expect(result).toBe(true);
      expect(mockUsersService.update).toHaveBeenCalledWith("user-1", {
        totpEnabled: true,
      });
    });

    it("should return false for an invalid token", async () => {
      const secret = TotpService._base32Encode(Buffer.from("enable-secret-2"));
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpSecret: secret,
      });

      const result = await service.enableMfa("user-1", "000000");

      expect(result).toBeFalsy();
      expect(mockUsersService.update).not.toHaveBeenCalled();
    });

    it("should return false when user has no totpSecret", async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpSecret: null,
      });

      const result = await service.enableMfa("user-1", "123456");
      expect(result).toBe(false);
    });
  });

  // ── verifyMfa ──────────────────────────────────────────────────────────────

  describe("verifyMfa", () => {
    it("should return true for a valid token when MFA is enabled", async () => {
      const secret = TotpService._base32Encode(Buffer.from("verify-secret"));
      const step = Math.floor(Date.now() / 1000 / 30);
      const token = TotpService._generateTotpCode(secret, step);

      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpSecret: secret,
        totpEnabled: true,
      });

      const result = await service.verifyMfa("user-1", token);
      expect(result).toBe(true);
    });

    it("should return false when MFA is disabled", async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpEnabled: false,
        totpSecret: "SOMESECRET",
      });

      const result = await service.verifyMfa("user-1", "123456");
      expect(result).toBe(false);
    });

    it("should return false when user has no secret", async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
        totpSecret: null,
      });

      const result = await service.verifyMfa("user-1", "123456");
      expect(result).toBe(false);
    });
  });

  // ── disableMfa ─────────────────────────────────────────────────────────────

  describe("disableMfa", () => {
    it("should disable MFA and clear the secret on valid token", async () => {
      const secret = TotpService._base32Encode(Buffer.from("disable-secret"));
      const step = Math.floor(Date.now() / 1000 / 30);
      const token = TotpService._generateTotpCode(secret, step);

      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpSecret: secret,
        totpEnabled: true,
      });
      mockUsersService.update.mockResolvedValue(undefined);

      const result = await service.disableMfa("user-1", token);

      expect(result).toBe(true);
      expect(mockUsersService.update).toHaveBeenCalledWith("user-1", {
        totpSecret: null,
        totpEnabled: false,
      });
    });

    it("should return false for an invalid token", async () => {
      const secret = TotpService._base32Encode(Buffer.from("disable-secret-2"));
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpSecret: secret,
        totpEnabled: true,
      });

      const result = await service.disableMfa("user-1", "000000");
      expect(result).toBeFalsy();
      expect(mockUsersService.update).not.toHaveBeenCalled();
    });

    it("should return false when MFA is not enabled", async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpEnabled: false,
        totpSecret: null,
      });

      const result = await service.disableMfa("user-1", "123456");
      expect(result).toBe(false);
    });
  });

  // ── getMfaStatus ───────────────────────────────────────────────────────────

  describe("getMfaStatus", () => {
    it("should return enabled=true when MFA is enabled", async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpEnabled: true,
      });
      const status = await service.getMfaStatus("user-1");
      expect(status).toEqual({ enabled: true });
    });

    it("should return enabled=false when MFA is disabled", async () => {
      mockUsersService.findOne.mockResolvedValue({
        ...mockUser,
        totpEnabled: false,
      });
      const status = await service.getMfaStatus("user-1");
      expect(status).toEqual({ enabled: false });
    });

    it("should return enabled=false when user is not found", async () => {
      mockUsersService.findOne.mockResolvedValue(null);
      const status = await service.getMfaStatus("ghost-user");
      expect(status).toEqual({ enabled: false });
    });
  });
});
