import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import axios from "axios";
import { Request } from "express";

import { AuthService } from "./auth.service";
import { ZohoStrategy } from "./zoho.strategy";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("ZohoStrategy", () => {
  let strategy: ZohoStrategy;

  const mockAuthService = {
    validateZohoUser: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        ZOHO_CLIENT_ID: "test-client-id",
        ZOHO_CLIENT_SECRET: "test-client-secret",
        ZOHO_REDIRECT_URI: "http://localhost:3001/auth/zoho/callback",
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZohoStrategy,
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<ZohoStrategy>(ZohoStrategy);
    // axios.isAxiosError uses an instanceof-like check we don't need here.
    (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn(() => false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  type SuccessUser = { accountsServer?: string; zohoId?: string };

  /**
   * Drive strategy.authenticate() with a fake request and collect whichever
   * passport-strategy callback fires (success / fail / error / redirect).
   */
  function runAuthenticate(
    req: Partial<Request>,
  ): Promise<
    | { kind: "success"; user: SuccessUser }
    | { kind: "fail"; challenge: unknown }
    | { kind: "error"; err: Error }
    | { kind: "redirect"; url: string }
  > {
    return new Promise((resolve) => {
      const inst = strategy as unknown as {
        success: (u: SuccessUser) => void;
        fail: (c: unknown) => void;
        error: (e: Error) => void;
        redirect: (u: string) => void;
      };
      inst.success = (user) => resolve({ kind: "success", user });
      inst.fail = (challenge) => resolve({ kind: "fail", challenge });
      inst.error = (err) => resolve({ kind: "error", err });
      inst.redirect = (url) => resolve({ kind: "redirect", url });

      strategy.authenticate(req as Request);
    });
  }

  it("exchanges the code at the DC reported by accounts-server", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: "at-au", refresh_token: "rt-au" },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: { ZUID: "ZUID-123", Email: "user@focusbear.io", Display_Name: "U" },
    });
    mockAuthService.validateZohoUser.mockResolvedValue({
      id: "user-1",
      email: "user@focusbear.io",
    });

    const result = await runAuthenticate({
      query: {
        code: "abc",
        "accounts-server": "https://accounts.zoho.com.au",
      },
    });

    expect(result.kind).toBe("success");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://accounts.zoho.com.au/oauth/v2/token",
      expect.any(URLSearchParams),
      expect.any(Object),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://accounts.zoho.com.au/oauth/user/info",
      expect.any(Object),
    );
    if (result.kind === "success") {
      expect(result.user.accountsServer).toBe("https://accounts.zoho.com.au");
      expect(result.user.zohoId).toBe("ZUID-123");
    }
  });

  it("falls back to the configured default DC when accounts-server is absent", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: "at", refresh_token: "rt" },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: { ZUID: "ZUID-1", Email: "u@example.com" },
    });
    mockAuthService.validateZohoUser.mockResolvedValue({ id: "u" });

    const result = await runAuthenticate({ query: { code: "abc" } });

    expect(result.kind).toBe("success");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://accounts.zoho.com/oauth/v2/token",
      expect.any(URLSearchParams),
      expect.any(Object),
    );
    if (result.kind === "success") {
      expect(result.user.accountsServer).toBe("https://accounts.zoho.com");
    }
  });

  it.each([
    ["unrelated host", "https://evil.example.com"],
    ["lookalike subdomain", "https://accounts.zoho.evil.com"],
    ["userinfo bypass", "https://accounts.zoho.com@evil.com"],
    ["http (not https)", "http://accounts.zoho.com"],
    ["host that isn't on the published DC list", "https://accounts.zoho.fr"],
  ])(
    "rejects spoofed accounts-server (%s) and falls back to the default DC",
    async (_label, spoofed) => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: "at", refresh_token: "rt" },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { ZUID: "Z", Email: "u@example.com" },
      });
      mockAuthService.validateZohoUser.mockResolvedValue({ id: "u" });

      const result = await runAuthenticate({
        query: { code: "abc", "accounts-server": spoofed },
      });

      expect(result.kind).toBe("success");
      // Critical: client_secret must NOT be POSTed to the spoofed host.
      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://accounts.zoho.com/oauth/v2/token",
        expect.any(URLSearchParams),
        expect.any(Object),
      );
    },
  );

  it.each([
    "https://accounts.zoho.com.au",
    "https://accounts.zoho.eu",
    "https://accounts.zoho.in",
    "https://accounts.zoho.jp",
    "https://accounts.zoho.com.cn",
    "https://accounts.zoho.sa",
    "https://accounts.zohocloud.ca",
  ])("accepts allowlisted DC %s", async (dc) => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: "at", refresh_token: "rt" },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: { ZUID: "Z", Email: "u@example.com" },
    });
    mockAuthService.validateZohoUser.mockResolvedValue({ id: "u" });

    const result = await runAuthenticate({
      query: { code: "abc", "accounts-server": dc },
    });

    expect(result.kind).toBe("success");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${dc}/oauth/v2/token`,
      expect.any(URLSearchParams),
      expect.any(Object),
    );
  });

  it("surfaces the underlying Zoho error when token exchange fails", async () => {
    (mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn(() => true);
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { error: "invalid_code", error_description: "code expired" },
      },
    });

    const result = await runAuthenticate({
      query: {
        code: "abc",
        "accounts-server": "https://accounts.zoho.com.au",
      },
    });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.err.message).toContain("Zoho token exchange failed");
      expect(result.err.message).toContain("invalid_code");
    }
  });

  it("fails fast when Zoho returns an error query param (no token exchange attempted)", async () => {
    const result = await runAuthenticate({
      query: { error: "access_denied", error_description: "user declined" },
    });

    expect(result.kind).toBe("fail");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
