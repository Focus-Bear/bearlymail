import { FOCUS_BEAR_CONNECTION_METHODS } from "../constants/focus-bear.constants";
import { FocusBearService } from "./focus-bear.service";
import {
  FocusBearApiError,
  FocusBearCredential,
  FocusBearNextFreeDateResponse,
  FocusBearProjectSuggestionResponse,
} from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";
import { FocusBearCredentialsService } from "./focus-bear-credentials.service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PASTED_TOKEN: FocusBearCredential = {
  method: FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN,
  accessToken: "fb_token_value",
};
const SIGNED_IN: FocusBearCredential = {
  method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
  accessToken: "access-1",
};
const RENEWED: FocusBearCredential = {
  method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
  accessToken: "access-2",
};
const TASK = {
  title: "Complete the evaluation form for Utsav",
  emailSubject: "Evaluation form",
  sender: "NIT Internships",
};
const NOT_CONNECTED = {
  connected: false,
  project: null,
  projects: [],
  dueDate: null,
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

const UNAUTHORIZED = new FocusBearApiError(401, "Focus Bear responded 401");

describe("FocusBearService", () => {
  let credentials: {
    resolve: jest.Mock;
    status: jest.Mock;
    disconnect: jest.Mock;
  };
  let focusBearApi: { suggestProject: jest.Mock; nextFreeDate: jest.Mock };
  let service: FocusBearService;

  const refuseOnce = () => {
    focusBearApi.suggestProject.mockRejectedValueOnce(UNAUTHORIZED);
    focusBearApi.nextFreeDate.mockRejectedValueOnce(UNAUTHORIZED);
  };

  beforeEach(() => {
    credentials = {
      resolve: jest.fn().mockResolvedValue(PASTED_TOKEN),
      status: jest.fn(),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
    focusBearApi = {
      suggestProject: jest.fn().mockResolvedValue(PROJECT_SUGGESTION),
      nextFreeDate: jest.fn().mockResolvedValue(NEXT_FREE_DATE),
    };
    service = new FocusBearService(
      credentials as unknown as FocusBearCredentialsService,
      focusBearApi as unknown as FocusBearApiService,
    );
  });

  describe("suggestForTask", () => {
    it("asks Focus Bear for both suggestions with the user's credential", async () => {
      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual({
        connected: true,
        project: PROJECT_SUGGESTION.project,
        projects: PROJECT_SUGGESTION.projects,
        dueDate: "2026-11-12",
      });
      expect(focusBearApi.suggestProject).toHaveBeenCalledWith(
        PASTED_TOKEN,
        TASK,
      );
      expect(focusBearApi.nextFreeDate).toHaveBeenCalledWith(PASTED_TOKEN);
    });

    it("returns not connected, without calling Focus Bear, when there is no connection", async () => {
      credentials.resolve.mockResolvedValue(null);

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual(
        NOT_CONNECTED,
      );
      expect(focusBearApi.suggestProject).not.toHaveBeenCalled();
    });

    it("saves without suggestions when Focus Bear's sign-in can't be reached", async () => {
      credentials.resolve.mockRejectedValue(new Error("fetch failed"));

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual(
        NOT_CONNECTED,
      );
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

    it("reports not connected when Focus Bear refuses a pasted token, without retrying", async () => {
      refuseOnce();

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual(
        NOT_CONNECTED,
      );
      expect(credentials.resolve).toHaveBeenCalledTimes(1);
    });

    it("renews a refused signed-in token once and retries with the new one", async () => {
      credentials.resolve
        .mockResolvedValueOnce(SIGNED_IN)
        .mockResolvedValueOnce(RENEWED);
      refuseOnce();

      const result = await service.suggestForTask(USER_ID, TASK);

      expect(result.connected).toBe(true);
      expect(result.dueDate).toBe("2026-11-12");
      expect(credentials.resolve).toHaveBeenLastCalledWith(USER_ID, {
        forceRenewal: true,
      });
      expect(focusBearApi.nextFreeDate).toHaveBeenLastCalledWith(RENEWED);
    });

    it("reports not connected when the renewed token is refused too", async () => {
      credentials.resolve.mockResolvedValue(SIGNED_IN);
      focusBearApi.suggestProject.mockRejectedValue(UNAUTHORIZED);
      focusBearApi.nextFreeDate.mockRejectedValue(UNAUTHORIZED);

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual(
        NOT_CONNECTED,
      );
      expect(credentials.resolve).toHaveBeenCalledTimes(2);
    });

    it("reports not connected when the sign-in can no longer be renewed", async () => {
      credentials.resolve
        .mockResolvedValueOnce(SIGNED_IN)
        .mockResolvedValueOnce(null);
      refuseOnce();

      await expect(service.suggestForTask(USER_ID, TASK)).resolves.toEqual(
        NOT_CONNECTED,
      );
    });
  });

  it("disconnect hands over to the credential store", async () => {
    await service.disconnect(USER_ID);

    expect(credentials.disconnect).toHaveBeenCalledWith(USER_ID);
  });
});
