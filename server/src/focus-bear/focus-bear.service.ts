import { Injectable, Logger } from "@nestjs/common";

import { PROMISE_STATUS } from "../constants/domain-statuses";
import {
  FOCUS_BEAR_CONNECTION_METHODS,
  FOCUS_BEAR_REJECTED_TOKEN_STATUSES,
} from "../constants/focus-bear.constants";
import {
  FocusBearApiError,
  FocusBearConnectionStatus,
  FocusBearCredential,
  FocusBearNextFreeDateResponse,
  FocusBearProjectSuggestionResponse,
  FocusBearTaskSuggestions,
  FocusBearTaskToFile,
} from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";
import { FocusBearCredentialsService } from "./focus-bear-credentials.service";

const NOT_CONNECTED: FocusBearTaskSuggestions = {
  connected: false,
  project: null,
  projects: [],
  dueDate: null,
};

type SuggestionResults = [
  PromiseSettledResult<FocusBearProjectSuggestionResponse>,
  PromiseSettledResult<FocusBearNextFreeDateResponse>,
];

const isRejectedToken = (reason: unknown): boolean =>
  reason instanceof FocusBearApiError &&
  FOCUS_BEAR_REJECTED_TOKEN_STATUSES.includes(reason.status);

const reasonOf = (result: PromiseSettledResult<unknown>): unknown =>
  result.status === PROMISE_STATUS.REJECTED ? result.reason : null;

const valueOf = <T>(result: PromiseSettledResult<T>): T | null =>
  result.status === PROMISE_STATUS.FULFILLED ? result.value : null;

const isAccessRefused = ([
  projectResult,
  dateResult,
]: SuggestionResults): boolean =>
  isRejectedToken(reasonOf(projectResult)) &&
  isRejectedToken(reasonOf(dateResult));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The user's Focus Bear connection, used only to ask Focus Bear which project
 * and day a task saved from an email should get.
 */
@Injectable()
export class FocusBearService {
  private readonly logger = new Logger(FocusBearService.name);

  constructor(
    private readonly credentials: FocusBearCredentialsService,
    private readonly focusBearApi: FocusBearApiService,
  ) {}

  status(userId: string): Promise<FocusBearConnectionStatus> {
    return this.credentials.status(userId);
  }

  disconnect(userId: string): Promise<void> {
    return this.credentials.disconnect(userId);
  }

  /**
   * A project and due date for a task about to be saved, each null when Focus Bear has
   * none or doesn't answer in time: the save never waits on, or fails because of, them.
   */
  async suggestForTask(
    userId: string,
    task: FocusBearTaskToFile,
  ): Promise<FocusBearTaskSuggestions> {
    const credential = await this.resolveCredential(userId, false);
    if (!credential) {
      return NOT_CONNECTED;
    }
    const results = await this.fetchSuggestions(credential, task);
    if (!isAccessRefused(results)) {
      return this.toSuggestions(results);
    }
    return this.retryWithRenewedToken(userId, credential, task);
  }

  /** A signed-in token Focus Bear refuses (e.g. after "log out everywhere") is renewed once. */
  private async retryWithRenewedToken(
    userId: string,
    refused: FocusBearCredential,
    task: FocusBearTaskToFile,
  ): Promise<FocusBearTaskSuggestions> {
    if (refused.method !== FOCUS_BEAR_CONNECTION_METHODS.OAUTH) {
      return NOT_CONNECTED;
    }
    const renewed = await this.resolveCredential(userId, true);
    if (!renewed) {
      return NOT_CONNECTED;
    }
    const results = await this.fetchSuggestions(renewed, task);
    return isAccessRefused(results)
      ? NOT_CONNECTED
      : this.toSuggestions(results);
  }

  /** Focus Bear's sign-in being unreachable is a missing suggestion, not a failed save. */
  private async resolveCredential(
    userId: string,
    forceRenewal: boolean,
  ): Promise<FocusBearCredential | null> {
    try {
      return await this.credentials.resolve(userId, { forceRenewal });
    } catch (error) {
      this.logger.warn(
        `Focus Bear sign-in unavailable: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  private fetchSuggestions(
    credential: FocusBearCredential,
    task: FocusBearTaskToFile,
  ): Promise<SuggestionResults> {
    return Promise.allSettled([
      this.focusBearApi.suggestProject(credential, task),
      this.focusBearApi.nextFreeDate(credential),
    ]);
  }

  private toSuggestions([
    projectResult,
    dateResult,
  ]: SuggestionResults): FocusBearTaskSuggestions {
    this.logFailure(projectResult, "project");
    this.logFailure(dateResult, "due date");
    const projectSuggestion = valueOf(projectResult);
    return {
      connected: true,
      project: projectSuggestion?.project ?? null,
      projects: projectSuggestion?.projects ?? [],
      dueDate: valueOf(dateResult)?.date ?? null,
    };
  }

  private logFailure(
    result: PromiseSettledResult<unknown>,
    suggestion: string,
  ): void {
    if (result.status === PROMISE_STATUS.FULFILLED) {
      return;
    }
    this.logger.warn(
      `Focus Bear ${suggestion} suggestion unavailable: ${errorMessage(result.reason)}`,
    );
  }
}
