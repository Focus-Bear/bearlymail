import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test, TestingModule } from "@nestjs/testing";

import { UsersService } from "../users/users.service";
import { GitHubAppService } from "./github-app.service";

describe("GitHubAppService - getAuthorizationUrl", () => {
  let service: GitHubAppService;
  let jwtService: jest.Mocked<JwtService>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        GITHUB_APP_CLIENT_ID: "test-client-id",
        GITHUB_APP_CLIENT_SECRET: "test-client-secret",
        GITHUB_APP_REDIRECT_URI: "http://localhost:3001/github/callback",
        FRONTEND_URL: "http://localhost:3000",
      };
      return config[key] ?? "";
    }),
  };

  const mockUsersService = {
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue("mock-state-jwt"),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue("mock-state-jwt");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubAppService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<GitHubAppService>(GitHubAppService);
    jwtService = module.get(JwtService);
  });

  it("should generate authorization URL with base scopes by default", () => {
    const url = service.getAuthorizationUrl("user-1");

    expect(url).toContain("scope=issues+project+read%3Aorg");
    expect(url).not.toContain("repo");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("state=mock-state-jwt");
  });

  it("should generate authorization URL without repo scope when includeRepo is false", () => {
    const url = service.getAuthorizationUrl("user-1", false);

    expect(url).toContain("scope=issues+project+read%3Aorg");
    expect(url).not.toContain("repo");
  });

  it("should include repo scope when includeRepo is true", () => {
    const url = service.getAuthorizationUrl("user-1", true);

    expect(url).toContain("repo");
    // Should still include base scopes
    expect(url).toContain("issues");
    expect(url).toContain("project");
    expect(url).toContain("read%3Aorg");
  });

  it("should sign state JWT with correct userId", () => {
    service.getAuthorizationUrl("user-abc");

    expect(jwtService.sign).toHaveBeenCalledWith(
      { userId: "user-abc", action: "connect" },
      { expiresIn: "10m" },
    );
  });
});

describe("GitHubAppService - createConnectToken", () => {
  let service: GitHubAppService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue(""),
  };
  const mockUsersService = { findOne: jest.fn(), update: jest.fn() };
  const mockJwtService = {
    sign: jest.fn().mockReturnValue("signed-token"),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtService.sign.mockReturnValue("signed-token");

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubAppService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<GitHubAppService>(GitHubAppService);
  });

  it("should create connect token with includeRepo: false by default", () => {
    service.createConnectToken("user-1");

    expect(mockJwtService.sign).toHaveBeenCalledWith(
      { userId: "user-1", action: "connect", includeRepo: false },
      { expiresIn: "5m" },
    );
  });

  it("should create connect token with includeRepo: true when requested", () => {
    service.createConnectToken("user-1", true);

    expect(mockJwtService.sign).toHaveBeenCalledWith(
      { userId: "user-1", action: "connect", includeRepo: true },
      { expiresIn: "5m" },
    );
  });
});

describe("GitHubAppService - verifyConnectToken", () => {
  let service: GitHubAppService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue(""),
  };
  const mockUsersService = { findOne: jest.fn(), update: jest.fn() };
  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitHubAppService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<GitHubAppService>(GitHubAppService);
  });

  it("should return userId and includeRepo from valid token", () => {
    mockJwtService.verify.mockReturnValue({
      userId: "user-1",
      action: "connect",
      includeRepo: true,
    });

    const result = service.verifyConnectToken("valid-token");

    expect(result).toEqual({ userId: "user-1", includeRepo: true });
  });

  it("should return userId with includeRepo: false when not set in token", () => {
    mockJwtService.verify.mockReturnValue({
      userId: "user-1",
      action: "connect",
    });

    const result = service.verifyConnectToken("valid-token");

    expect(result).toEqual({ userId: "user-1", includeRepo: undefined });
  });

  it("should return null for invalid action", () => {
    mockJwtService.verify.mockReturnValue({
      userId: "user-1",
      action: "wrong-action",
    });

    const result = service.verifyConnectToken("bad-token");

    expect(result).toBeNull();
  });

  it("should return null when JWT verification throws", () => {
    mockJwtService.verify.mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const result = service.verifyConnectToken("expired-token");

    expect(result).toBeNull();
  });
});
