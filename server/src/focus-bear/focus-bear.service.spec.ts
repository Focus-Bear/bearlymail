import { User } from "../database/entities/user.entity";
import { UsersService } from "../users/users.service";
import { FocusBearService } from "./focus-bear.service";
import {
  FocusBearApiError,
  FocusBearNextFreeDateResponse,
  FocusBearOAuthError,
  FocusBearProjectSuggestionResponse,
} from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REFRESH_TOKEN = "refresh-token-1";
const ROTATED_REFRESH_TOKEN = "refresh-token-2";
const ACCESS_TOKEN = "access-token-1";
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const tokens = (overrides = {}) => ({
  accessToken: ACCESS_TOKEN,
  refreshToken: ROTATED_REFRESH_TOKEN,
  expiresAt: Date.now() + FIFTEEN_MINUTES_MS,
  ...overrides,
});
const TASK = {
  title: "Complete the evaluation form for Utsav",
  emailSubject: "Evaluation form",
  sender: "NIT Internships",
};

const PROJECT_SUGGESTION: FocusBearProjectSuggestionResponse = {
  project: { id: "p-interns", name: "Internship program", confidence: 0.87 },
  min_confidence: 0.6,
  projects: [
    { id: "p-interns", name: "Internship program" },
    { id: "p-marketing", name: "Marketing" },
  ],
};

const NEXT_FREE_DATE: FocusBearNextFreeDateResponse = {
  date: "2026-11-12",
  duration_minutes: 5,
  free_minutes: 180,
  full_working_days: 1,
  search_days: 90,
  timezone: "Australia/Melbourne",
};

describe("FocusBearService", () => {
  let usersService: {
    findOneWithFocusBearToken: jest.Mock;
    update: jest.Mock;
  };
  let focusBearApi: { suggestProject: jest.Mock; nextFreeDate: jest.Mock };
  let oauthClient: {
    exchangeCode: jest.Mock;
    refresh: jest.Mock;
    revoke: jest.Mock;
  };
  let service: FocusBearService;

  beforeEach(() => {
    usersService = {
      findOneWithFocusBearToken: jest.fn().mockResolvedValue({
        id: USER_ID,
        focusBearRefreshToken: REFRESH_TOKEN,
      } as User),
      update: jest.fn().mockResolvedValue({}),
    };
    focusBearApi = {
      suggestProject: jest.fn().mockResolvedValue(PROJECT_SUGGESTION),
      nextFreeDate: jest.fn().mockResolvedValue(NEXT_FREE_DATE),
    };
    oauthClient = {
      exchangeCode: jest.fn().mockResolvedValue(tokens()),
      refresh: jest.fn().mockResolvedValue(tokens()),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    service = new FocusBearService(
      usersService as unknown as UsersService,
      focusBearApi as unknown as FocusBearApiService,
      oauthClient as unknown as FocusBearOAuthClient,
    );
  });

  describe("suggestForTask", () => {
    it("asks Focus Bear for both suggestions with an access token from the refresh token", async () => {
      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual({
        connected: true,
        project: PROJECT_SUGGESTION.project,
        projects: PROJECT_SUGGESTION.projects,
        dueDate: "2026-11-12",
      });
      expect(oauthClient.refresh).toHaveBeenCalledWith(REFRESH_TOKEN);
      expect(focusBearApi.suggestProject).toHaveBeenCalledWith(
        ACCESS_TOKEN,
        TASK,
      );
      expect(focusBearApi.nextFreeDate).toHaveBeenCalledWith(ACCESS_TOKEN);
    });

    it("returns not connected, without calling Focus Bear, when there is no token", async () => {
      usersService.findOneWithFocusBearToken.mockResolvedValue({
        id: USER_ID,
        focusBearRefreshToken: null,
      });

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual({
        connected: false,
        project: null,
        projects: [],
        dueDate: null,
      });
      expect(focusBearApi.suggestProject).not.toHaveBeenCalled();
    });

    it("keeps the due date when the project suggestion fails", async () => {
      focusBearApi.suggestProject.mockRejectedValue(
        new FocusBearApiError(500, "Focus Bear responded 500"),
      );

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual({
        connected: true,
        project: null,
        projects: [],
        dueDate: "2026-11-12",
      });
    });

    it("keeps the project when the date lookup times out", async () => {
      focusBearApi.nextFreeDate.mockRejectedValue(
        new DOMException("The operation timed out.", "TimeoutError"),
      );

      const result = await service.suggestForTask(USER_ID, TASK);

      expect(result.project).toEqual(PROJECT_SUGGESTION.project);
      expect(result.dueDate).toBeNull();
    });

    it("reports not connected when Focus Bear refuses the token", async () => {
      focusBearApi.suggestProject.mockRejectedValue(
        new FocusBearApiError(401, "Focus Bear responded 401"),
      );
      focusBearApi.nextFreeDate.mockRejectedValue(
        new FocusBearApiError(401, "Focus Bear responded 401"),
      );

      await expect(
        service.suggestForTask(USER_ID, TASK),
      ).resolves.toMatchObject({
        connected: false,
      });
    });
  });

  describe("access tokens", () => {
    it("stores the rotated refresh token every time it refreshes", async () => {
      await service.suggestForTask(USER_ID, TASK);

      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: ROTATED_REFRESH_TOKEN,
      });
    });

    it("reuses an access token until it is about to expire", async () => {
      await service.suggestForTask(USER_ID, TASK);
      await service.suggestForTask(USER_ID, TASK);

      expect(oauthClient.refresh).toHaveBeenCalledTimes(1);
    });

    it("refreshes again once the access token has expired", async () => {
      oauthClient.refresh.mockResolvedValueOnce(
        tokens({ expiresAt: Date.now() - 1 }),
      );

      await service.suggestForTask(USER_ID, TASK);
      await service.suggestForTask(USER_ID, TASK);

      expect(oauthClient.refresh).toHaveBeenCalledTimes(2);
    });

    it("refreshes once when two saves need a token at the same time", async () => {
      await Promise.all([
        service.suggestForTask(USER_ID, TASK),
        service.suggestForTask(USER_ID, TASK),
      ]);

      expect(oauthClient.refresh).toHaveBeenCalledTimes(1);
    });

    it("disconnects when Focus Bear says the grant is gone", async () => {
      oauthClient.refresh.mockRejectedValue(
        new FocusBearOAuthError("invalid_grant", "Focus Bear responded 403"),
      );

      await expect(
        service.suggestForTask(USER_ID, TASK),
      ).resolves.toMatchObject({ connected: false });
      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: null,
      });
      expect(focusBearApi.suggestProject).not.toHaveBeenCalled();
    });

    it("keeps the connection when the refresh merely fails", async () => {
      oauthClient.refresh.mockRejectedValue(new Error("fetch failed"));

      await expect(
        service.suggestForTask(USER_ID, TASK),
      ).resolves.toMatchObject({ connected: false });
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it("drops a cached access token Focus Bear refuses", async () => {
      await service.suggestForTask(USER_ID, TASK);
      focusBearApi.suggestProject.mockRejectedValueOnce(
        new FocusBearApiError(401, "Focus Bear responded 401"),
      );
      focusBearApi.nextFreeDate.mockRejectedValueOnce(
        new FocusBearApiError(401, "Focus Bear responded 401"),
      );

      await service.suggestForTask(USER_ID, TASK);
      await service.suggestForTask(USER_ID, TASK);

      expect(oauthClient.refresh).toHaveBeenCalledTimes(2);
    });
  });

  describe("completeConnection", () => {
    it("trades the code for tokens and keeps the refresh token", async () => {
      await service.completeConnection(USER_ID, "auth-code", "verifier");

      expect(oauthClient.exchangeCode).toHaveBeenCalledWith(
        "auth-code",
        "verifier",
      );
      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: ROTATED_REFRESH_TOKEN,
      });
    });

    it("uses the access token it was given, without refreshing", async () => {
      await service.completeConnection(USER_ID, "auth-code", "verifier");
      await service.suggestForTask(USER_ID, TASK);

      expect(oauthClient.refresh).not.toHaveBeenCalled();
      expect(focusBearApi.nextFreeDate).toHaveBeenCalledWith(ACCESS_TOKEN);
    });

    it("stores nothing when Focus Bear refuses the code", async () => {
      oauthClient.exchangeCode.mockRejectedValue(
        new FocusBearOAuthError("invalid_grant", "Focus Bear responded 403"),
      );

      await expect(
        service.completeConnection(USER_ID, "auth-code", "verifier"),
      ).rejects.toBeInstanceOf(FocusBearOAuthError);
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    it("clears the stored refresh token and revokes it at Focus Bear", async () => {
      await service.disconnect(USER_ID);

      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: null,
      });
      expect(oauthClient.revoke).toHaveBeenCalledWith(REFRESH_TOKEN);
    });

    it("still disconnects when the revocation fails", async () => {
      oauthClient.revoke.mockRejectedValue(new Error("fetch failed"));

      await expect(service.disconnect(USER_ID)).resolves.toBeUndefined();
      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearRefreshToken: null,
      });
    });
  });

  it("isConnected reflects whether a refresh token is stored", async () => {
    await expect(service.isConnected(USER_ID)).resolves.toBe(true);
    usersService.findOneWithFocusBearToken.mockResolvedValue({ id: USER_ID });
    await expect(service.isConnected(USER_ID)).resolves.toBe(false);
  });
});
