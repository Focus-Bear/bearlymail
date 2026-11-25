import {
  FOCUS_BEAR_CONNECTION_METHODS,
  FOCUS_BEAR_OAUTH,
} from "../constants/focus-bear.constants";
import { MILLISECONDS } from "../constants/time-constants";
import { User } from "../database/entities/user.entity";
import { UsersService } from "../users/users.service";
import { FocusBearOAuthError } from "./focus-bear.types";
import { FocusBearCredentialsService } from "./focus-bear-credentials.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-17T00:00:00Z");
const ONE_HOUR_SECONDS = 3600;

const CLEARED_OAUTH = {
  focusBearRefreshToken: null,
  focusBearAccessToken: null,
  focusBearAccessTokenRenewAt: null,
};

const columns = (overrides: Partial<User>): Partial<User> => ({
  id: USER_ID,
  focusBearApiToken: null,
  ...CLEARED_OAUTH,
  ...overrides,
});

const SIGNED_IN = columns({
  focusBearRefreshToken: "refresh-1",
  focusBearAccessToken: "access-1",
  focusBearAccessTokenRenewAt: new Date(NOW.getTime() + MILLISECONDS.HOUR),
});

describe("FocusBearCredentialsService", () => {
  let usersService: {
    findOneWithFocusBearCredentials: jest.Mock;
    update: jest.Mock;
  };
  let oauthClient: {
    isConfigured: jest.Mock;
    refresh: jest.Mock;
    revoke: jest.Mock;
  };
  let service: FocusBearCredentialsService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    usersService = {
      findOneWithFocusBearCredentials: jest.fn().mockResolvedValue(SIGNED_IN),
      update: jest.fn().mockResolvedValue({}),
    };
    oauthClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      refresh: jest.fn().mockResolvedValue({
        access_token: "access-2",
        refresh_token: "refresh-2",
        expires_in: ONE_HOUR_SECONDS,
      }),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    service = new FocusBearCredentialsService(
      usersService as unknown as UsersService,
      oauthClient as unknown as FocusBearOAuthClient,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("resolve", () => {
    it("uses the cached access token while it isn't due for renewal", async () => {
      await expect(service.resolve(USER_ID)).resolves.toEqual({
        method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
        accessToken: "access-1",
      });
      expect(oauthClient.refresh).not.toHaveBeenCalled();
    });

    it("renews a token that's due and keeps the rotated refresh token", async () => {
      usersService.findOneWithFocusBearCredentials.mockResolvedValue({
        ...SIGNED_IN,
        focusBearAccessTokenRenewAt: new Date(NOW.getTime() - 1),
      });

      await expect(service.resolve(USER_ID)).resolves.toEqual({
        method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
        accessToken: "access-2",
      });
      expect(oauthClient.refresh).toHaveBeenCalledWith("refresh-1");
      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: "refresh-2",
        focusBearAccessToken: "access-2",
        focusBearAccessTokenRenewAt: new Date(
          NOW.getTime() + MILLISECONDS.HOUR - FOCUS_BEAR_OAUTH.EXPIRY_SKEW_MS,
        ),
      });
    });

    it("renews at least daily, however long the access token lasts", async () => {
      oauthClient.refresh.mockResolvedValue({
        access_token: "access-2",
        expires_in: 30 * 24 * ONE_HOUR_SECONDS,
      });

      await service.resolve(USER_ID, { forceRenewal: true });

      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: "refresh-1",
        focusBearAccessToken: "access-2",
        focusBearAccessTokenRenewAt: new Date(
          NOW.getTime() + FOCUS_BEAR_OAUTH.MAX_ACCESS_TOKEN_AGE_MS,
        ),
      });
    });

    it("ends the connection when Focus Bear refuses the refresh token", async () => {
      oauthClient.refresh.mockRejectedValue(
        new FocusBearOAuthError(
          FOCUS_BEAR_OAUTH.INVALID_GRANT_ERROR,
          "Focus Bear token endpoint responded 403",
        ),
      );

      await expect(
        service.resolve(USER_ID, { forceRenewal: true }),
      ).resolves.toBeNull();
      expect(usersService.update).toHaveBeenCalledWith(USER_ID, CLEARED_OAUTH);
    });

    it("keeps the connection when the refresh fails for another reason", async () => {
      oauthClient.refresh.mockRejectedValue(new Error("fetch failed"));

      await expect(
        service.resolve(USER_ID, { forceRenewal: true }),
      ).rejects.toThrow("fetch failed");
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it("shares one renewal between saves made at the same time", async () => {
      await Promise.all([
        service.resolve(USER_ID, { forceRenewal: true }),
        service.resolve(USER_ID, { forceRenewal: true }),
      ]);

      expect(oauthClient.refresh).toHaveBeenCalledTimes(1);
    });

    it("falls back to a pasted token when the user never signed in", async () => {
      usersService.findOneWithFocusBearCredentials.mockResolvedValue(
        columns({ focusBearApiToken: "pasted" }),
      );

      await expect(service.resolve(USER_ID)).resolves.toEqual({
        method: FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN,
        accessToken: "pasted",
      });
    });

    it("returns null when nothing is connected", async () => {
      usersService.findOneWithFocusBearCredentials.mockResolvedValue(
        columns({}),
      );

      await expect(service.resolve(USER_ID)).resolves.toBeNull();
    });
  });

  describe("status", () => {
    it("reports a signed-in connection over a pasted token", async () => {
      usersService.findOneWithFocusBearCredentials.mockResolvedValue({
        ...SIGNED_IN,
        focusBearApiToken: "pasted",
      });

      await expect(service.status(USER_ID)).resolves.toEqual({
        connected: true,
        method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
        oauthAvailable: true,
      });
    });

    it("reports a pasted token as still connected", async () => {
      usersService.findOneWithFocusBearCredentials.mockResolvedValue(
        columns({ focusBearApiToken: "pasted" }),
      );
      oauthClient.isConfigured.mockReturnValue(false);

      await expect(service.status(USER_ID)).resolves.toEqual({
        connected: true,
        method: FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN,
        oauthAvailable: false,
      });
    });
  });

  describe("saveOAuthTokens", () => {
    it("stores the tokens and retires a pasted token", async () => {
      await service.saveOAuthTokens(USER_ID, {
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: ONE_HOUR_SECONDS,
      });

      expect(usersService.update).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          focusBearApiToken: null,
          focusBearRefreshToken: "refresh-1",
          focusBearAccessToken: "access-1",
        }),
      );
    });

    it("refuses tokens without a refresh token, which couldn't be renewed", async () => {
      await expect(
        service.saveOAuthTokens(USER_ID, { access_token: "access-1" }),
      ).rejects.toBeInstanceOf(FocusBearOAuthError);
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("clears every credential and revokes the refresh token", async () => {
      await service.disconnect(USER_ID);

      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearApiToken: null,
        ...CLEARED_OAUTH,
      });
      expect(oauthClient.revoke).toHaveBeenCalledWith("refresh-1");
    });

    it("still disconnects when Focus Bear can't revoke the token", async () => {
      oauthClient.revoke.mockRejectedValue(new Error("fetch failed"));

      await expect(service.disconnect(USER_ID)).resolves.toBeUndefined();
      expect(usersService.update).toHaveBeenCalled();
    });

    it("doesn't call Focus Bear for a pasted token", async () => {
      usersService.findOneWithFocusBearCredentials.mockResolvedValue(
        columns({ focusBearApiToken: "pasted" }),
      );

      await service.disconnect(USER_ID);

      expect(oauthClient.revoke).not.toHaveBeenCalled();
    });
  });
});
