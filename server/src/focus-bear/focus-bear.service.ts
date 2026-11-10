import { BadRequestException, Injectable, Logger } from "@nestjs/common";

import { PROMISE_STATUS } from "../constants/domain-statuses";
import { FOCUS_BEAR_REJECTED_TOKEN_STATUSES } from "../constants/focus-bear.constants";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import {
  FocusBearApiError,
  FocusBearNextFreeDateResponse,
  FocusBearProjectSuggestionResponse,
  FocusBearTaskSuggestions,
  FocusBearTaskToFile,
} from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";

const TOKEN_REJECTED_MESSAGE =
  "Focus Bear didn't accept that token. Create one with the tasks:read scope in Focus Bear and paste it again.";
const FOCUS_BEAR_UNREACHABLE_MESSAGE =
  "Couldn't reach Focus Bear to check the token. Try again in a moment.";

const NOT_CONNECTED: FocusBearTaskSuggestions = {
  connected: false,
  project: null,
  projects: [],
  dueDate: null,
};

const isRejectedToken = (reason: unknown): boolean =>
  reason instanceof FocusBearApiError &&
  FOCUS_BEAR_REJECTED_TOKEN_STATUSES.includes(reason.status);

/**
 * The user's Focus Bear connection: an access token they create in Focus Bear and
 * paste here, stored encrypted, used only to ask Focus Bear which project and day a
 * task saved from an email should get.
 */
@Injectable()
export class FocusBearService {
  private readonly logger = new Logger(FocusBearService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly focusBearApi: FocusBearApiService,
  ) {}

  async isConnected(userId: string): Promise<boolean> {
    return (await this.loadToken(userId)) !== null;
  }

  /** Checks the token against Focus Bear before storing it, so a typo fails here, not on every save. */
  async connect(userId: string, rawToken: string): Promise<void> {
    const token = rawToken.trim();
    try {
      await this.focusBearApi.nextFreeDate(token);
    } catch (error) {
      throw new BadRequestException(
        isRejectedToken(error)
          ? TOKEN_REJECTED_MESSAGE
          : FOCUS_BEAR_UNREACHABLE_MESSAGE,
      );
    }
    await this.usersService.update(userId, { focusBearApiToken: token });
  }

  async disconnect(userId: string): Promise<void> {
    await this.usersService.update(userId, { focusBearApiToken: null });
  }

  /**
   * A project and due date for a task about to be saved, each null when Focus Bear has
   * none or doesn't answer in time: the save never waits on, or fails because of, them.
   */
  async suggestForTask(
    userId: string,
    task: FocusBearTaskToFile,
  ): Promise<FocusBearTaskSuggestions> {
    const token = await this.loadToken(userId);
    if (!token) {
      return NOT_CONNECTED;
    }
    const [projectResult, dateResult] = await Promise.allSettled([
      this.focusBearApi.suggestProject(token, task),
      this.focusBearApi.nextFreeDate(token),
    ]);
    if (
      isRejectedToken(this.reasonOf(projectResult)) &&
      isRejectedToken(this.reasonOf(dateResult))
    ) {
      return NOT_CONNECTED;
    }
    this.logFailure(projectResult, "project");
    this.logFailure(dateResult, "due date");
    const projectSuggestion =
      this.valueOf<FocusBearProjectSuggestionResponse>(projectResult);
    const nextFreeDate =
      this.valueOf<FocusBearNextFreeDateResponse>(dateResult);
    return {
      connected: true,
      project: projectSuggestion?.project ?? null,
      projects: projectSuggestion?.projects ?? [],
      dueDate: nextFreeDate?.date ?? null,
    };
  }

  private async loadToken(userId: string): Promise<string | null> {
    const user = await this.usersService.findOneWithFocusBearToken(userId);
    return EncryptionHelper.tryDecrypt(user?.focusBearApiToken) || null;
  }

  private valueOf<T>(result: PromiseSettledResult<T>): T | null {
    return result.status === PROMISE_STATUS.FULFILLED ? result.value : null;
  }

  private reasonOf(result: PromiseSettledResult<unknown>): unknown {
    return result.status === PROMISE_STATUS.REJECTED ? result.reason : null;
  }

  private logFailure(
    result: PromiseSettledResult<unknown>,
    suggestion: string,
  ): void {
    if (result.status === PROMISE_STATUS.FULFILLED) {
      return;
    }
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    this.logger.warn(
      `Focus Bear ${suggestion} suggestion unavailable: ${message}`,
    );
  }
}
