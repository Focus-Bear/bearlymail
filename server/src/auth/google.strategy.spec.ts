import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { AuthService } from "./auth.service";
import { GoogleStrategy } from "./google.strategy";

describe("GoogleStrategy", () => {
  let strategy: GoogleStrategy;
  let authService: AuthService;
  let configService: ConfigService;

  const mockAuthService = {
    validateGoogleUser: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        GOOGLE_CLIENT_ID: "test-client-id",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3001/auth/google/callback",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<GoogleStrategy>(GoogleStrategy);
    authService = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validate", () => {
    const mockProfile = {
      id: "google-user-123",
      emails: [{ value: "test@example.com" }],
      displayName: "Test User",
    };

    const mockAccessToken = "access-token-123";
    const mockRefreshToken = "refresh-token-123";

    it("should return user with Google data when validation succeeds", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
      };

      mockAuthService.validateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        mockAccessToken,
        mockRefreshToken,
        mockProfile,
      );

      expect(authService.validateGoogleUser).toHaveBeenCalledWith(
        mockProfile,
        mockAccessToken,
        mockRefreshToken,
      );
      expect(result).toEqual({
        ...mockUser,
        googleProfile: mockProfile,
        googleAccessToken: mockAccessToken,
        googleRefreshToken: mockRefreshToken,
        googleId: mockProfile.id,
      });
    });

    it("should throw error when validation fails", async () => {
      const error = new Error("Validation failed");
      mockAuthService.validateGoogleUser.mockRejectedValue(error);

      await expect(
        strategy.validate(mockAccessToken, mockRefreshToken, mockProfile),
      ).rejects.toThrow("Validation failed");
    });

    it("should attach Google profile data to user", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      mockAuthService.validateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        mockAccessToken,
        mockRefreshToken,
        mockProfile,
      );

      expect(result.googleProfile).toEqual(mockProfile);
      expect(result.googleAccessToken).toBe(mockAccessToken);
      expect(result.googleRefreshToken).toBe(mockRefreshToken);
      expect(result.googleId).toBe(mockProfile.id);
    });

    it("should handle profile without displayName", async () => {
      const profileWithoutName = {
        id: "google-user-123",
        emails: [{ value: "test@example.com" }],
      };

      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      mockAuthService.validateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(
        mockAccessToken,
        mockRefreshToken,
        profileWithoutName,
      );

      expect(result).toBeDefined();
      expect(result.googleProfile).toEqual(profileWithoutName);
    });

    it("should handle missing refresh token", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      mockAuthService.validateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate(mockAccessToken, "", mockProfile);

      expect(result.googleRefreshToken).toBe("");
    });

    it("should handle missing access token", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
      };

      mockAuthService.validateGoogleUser.mockResolvedValue(mockUser);

      const result = await strategy.validate("", mockRefreshToken, mockProfile);

      expect(result.googleAccessToken).toBe("");
    });

    it("should propagate errors from authService", async () => {
      const error = new Error("Database connection failed");
      mockAuthService.validateGoogleUser.mockRejectedValue(error);

      await expect(
        strategy.validate(mockAccessToken, mockRefreshToken, mockProfile),
      ).rejects.toThrow("Database connection failed");
    });
  });

  describe("constructor", () => {
    it("should initialize with correct OAuth configuration", () => {
      expect(configService.get).toHaveBeenCalledWith("GOOGLE_CLIENT_ID");
      expect(configService.get).toHaveBeenCalledWith("GOOGLE_CLIENT_SECRET");
      expect(configService.get).toHaveBeenCalledWith("GOOGLE_REDIRECT_URI");
    });
  });
});
