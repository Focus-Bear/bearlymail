import { BadRequestException } from "@nestjs/common";

import { User } from "../database/entities/user.entity";
import { UsersService } from "../users/users.service";
import { FocusBearService } from "./focus-bear.service";
import {
  FocusBearApiError,
  FocusBearNextFreeDateResponse,
  FocusBearProjectSuggestionResponse,
} from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "fb_token_value";
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
  let service: FocusBearService;

  beforeEach(() => {
    usersService = {
      findOneWithFocusBearToken: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, focusBearApiToken: TOKEN } as User),
      update: jest.fn().mockResolvedValue({}),
    };
    focusBearApi = {
      suggestProject: jest.fn().mockResolvedValue(PROJECT_SUGGESTION),
      nextFreeDate: jest.fn().mockResolvedValue(NEXT_FREE_DATE),
    };
    service = new FocusBearService(
      usersService as unknown as UsersService,
      focusBearApi as unknown as FocusBearApiService,
    );
  });

  describe("suggestForTask", () => {
    it("asks Focus Bear for both suggestions with the user's token", async () => {
      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual({
        connected: true,
        project: PROJECT_SUGGESTION.project,
        projects: PROJECT_SUGGESTION.projects,
        dueDate: "2026-11-12",
      });
      expect(focusBearApi.suggestProject).toHaveBeenCalledWith(TOKEN, TASK);
      expect(focusBearApi.nextFreeDate).toHaveBeenCalledWith(TOKEN);
    });

    it("returns not connected, without calling Focus Bear, when there is no token", async () => {
      usersService.findOneWithFocusBearToken.mockResolvedValue({
        id: USER_ID,
        focusBearApiToken: null,
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

  describe("connect", () => {
    it("checks the token with Focus Bear before storing it, trimmed", async () => {
      await service.connect(USER_ID, `  ${TOKEN}\n`);

      expect(focusBearApi.nextFreeDate).toHaveBeenCalledWith(TOKEN);
      expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
        focusBearApiToken: TOKEN,
      });
    });

    it("refuses a token Focus Bear rejects, and stores nothing", async () => {
      focusBearApi.nextFreeDate.mockRejectedValue(
        new FocusBearApiError(401, "Focus Bear responded 401"),
      );

      await expect(service.connect(USER_ID, TOKEN)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it("refuses to store a token it couldn't check", async () => {
      focusBearApi.nextFreeDate.mockRejectedValue(new Error("fetch failed"));

      await expect(service.connect(USER_ID, TOKEN)).rejects.toThrow(
        "Couldn't reach Focus Bear",
      );
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  it("disconnect clears the stored token", async () => {
    await service.disconnect(USER_ID);

    expect(usersService.update).toHaveBeenCalledWith(USER_ID, {
      focusBearApiToken: null,
    });
  });
});
