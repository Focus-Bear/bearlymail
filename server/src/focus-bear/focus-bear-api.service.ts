import { Injectable } from "@nestjs/common";

import {
  FOCUS_BEAR_API,
  FOCUS_BEAR_CONNECTION_METHODS,
  FocusBearConnectionMethod,
} from "../constants/focus-bear.constants";
import { HTTP_HEADERS } from "../constants/http-headers";
import {
  FocusBearApiError,
  FocusBearCredential,
  FocusBearNextFreeDateResponse,
  FocusBearProjectSuggestionResponse,
  FocusBearTaskToFile,
} from "./focus-bear.types";

const JSON_CONTENT_TYPE = "application/json";
const BEARER_PREFIX = "Bearer ";

const PATHS_BY_METHOD: Record<
  FocusBearConnectionMethod,
  { SUGGEST_PROJECT: string; NEXT_FREE_DATE: string }
> = {
  [FOCUS_BEAR_CONNECTION_METHODS.OAUTH]: FOCUS_BEAR_API.OAUTH_PATHS,
  [FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN]:
    FOCUS_BEAR_API.PASTED_TOKEN_PATHS,
};

/** Calls the Focus Bear API as the user, with the access they connected. */
@Injectable()
export class FocusBearApiService {
  async suggestProject(
    credential: FocusBearCredential,
    task: FocusBearTaskToFile,
  ): Promise<FocusBearProjectSuggestionResponse> {
    return this.request<FocusBearProjectSuggestionResponse>(
      credential.accessToken,
      PATHS_BY_METHOD[credential.method].SUGGEST_PROJECT,
      {
        method: "POST",
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          email_subject: task.emailSubject,
          sender: task.sender,
        }),
      },
    );
  }

  /** Without a duration Focus Bear counts the task as a short one. */
  async nextFreeDate(
    credential: FocusBearCredential,
    durationMinutes?: number,
  ): Promise<FocusBearNextFreeDateResponse> {
    const query =
      durationMinutes === undefined
        ? ""
        : `?${new URLSearchParams({ [FOCUS_BEAR_API.DURATION_QUERY_PARAM]: String(durationMinutes) })}`;
    return this.request<FocusBearNextFreeDateResponse>(
      credential.accessToken,
      `${PATHS_BY_METHOD[credential.method].NEXT_FREE_DATE}${query}`,
      { method: "GET" },
    );
  }

  private async request<T>(
    token: string,
    path: string,
    init: { method: string; body?: string },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: {
        [HTTP_HEADERS.ACCEPT]: JSON_CONTENT_TYPE,
        [HTTP_HEADERS.CONTENT_TYPE]: JSON_CONTENT_TYPE,
        [HTTP_HEADERS.AUTHORIZATION]: `${BEARER_PREFIX}${token}`,
      },
      signal: AbortSignal.timeout(FOCUS_BEAR_API.REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new FocusBearApiError(
        response.status,
        `Focus Bear responded ${response.status} to ${path.split("?")[0]}`,
      );
    }
    return (await response.json()) as T;
  }

  private baseUrl(): string {
    return (
      process.env[FOCUS_BEAR_API.BASE_URL_ENV] ||
      FOCUS_BEAR_API.DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
  }
}
