import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { GITHUB_METADATA_INLINE_FETCH_TIMEOUT_MS } from "../constants/github-notification.constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import { ThreadGithubMetadata } from "./github-category-signals.helper";
import {
  GithubCategorySignalsService,
  GithubSignalsThread,
} from "./github-category-signals.service";
import { GitHubEmailInfoService } from "./github-email-info.service";

const USER_ID = "user-1";
const THREAD_ID = "thread-1";
const EMAIL_RECEIVED_AT = new Date("2026-09-01T10:00:00.000Z");
const FETCHED_BEFORE_EMAIL = "2026-08-31T10:00:00.000Z";
const FETCHED_AFTER_EMAIL = "2026-09-01T11:00:00.000Z";
const ISSUE_URL = "https://github.com/Focus-Bear/Mac-App/issues/812";

const EMAIL = {
  id: "email-1",
  from: "qa-tester <notifications@github.com>",
  subject: "Re: [Focus-Bear/Mac-App] Timer drifts after sleep (Issue #812)",
  body: `@qa-tester left a comment (Focus-Bear/Mac-App#812)\n\nQA — please proceed with testing.\n\nView it on GitHub ${ISSUE_URL}`,
  htmlBody: null,
  receivedAt: EMAIL_RECEIVED_AT,
};

function metadata(
  fetchedAt: string,
  status = "QA failed",
): ThreadGithubMetadata {
  return {
    links: [
      {
        type: "issue",
        owner: "Focus-Bear",
        repo: "Mac-App",
        number: 812,
        url: ISSUE_URL,
        status: {
          state: "open",
          projects: [{ name: "Mac App roadmap", status }],
        },
        fetchedAt,
      },
    ],
  };
}

function thread(fetchedAt: string): GithubSignalsThread {
  return { id: THREAD_ID, githubMetadata: metadata(fetchedAt) };
}

describe("GithubCategorySignalsService", () => {
  let service: GithubCategorySignalsService;
  let processMetadata: jest.Mock;
  let findOne: jest.Mock;

  beforeEach(async () => {
    processMetadata = jest.fn().mockResolvedValue(undefined);
    findOne = jest.fn().mockResolvedValue({
      id: THREAD_ID,
      githubMetadata: metadata(FETCHED_AFTER_EMAIL, "QA passed"),
    });
    const module = await Test.createTestingModule({
      providers: [
        GithubCategorySignalsService,
        {
          provide: getRepositoryToken(EmailThread),
          useValue: { findOne } as unknown as Repository<EmailThread>,
        },
        {
          provide: GitHubEmailInfoService,
          useValue: { processEmailGitHubMetadataForJob: processMetadata },
        },
      ],
    }).compile();
    service = module.get(GithubCategorySignalsService);
  });

  it("does not fetch when the thread's metadata is newer than the email", async () => {
    const signals = await service.resolveForEmail(
      USER_ID,
      EMAIL,
      thread(FETCHED_AFTER_EMAIL),
    );

    expect(processMetadata).not.toHaveBeenCalled();
    expect(signals?.projectStatuses).toEqual([
      { project: "Mac App roadmap", status: "QA failed" },
    ]);
  });

  it("fetches inline and uses the refreshed metadata when the status predates the email", async () => {
    const signals = await service.resolveForEmail(
      USER_ID,
      EMAIL,
      thread(FETCHED_BEFORE_EMAIL),
    );

    expect(processMetadata).toHaveBeenCalledWith(
      USER_ID,
      EMAIL.id,
      THREAD_ID,
      true,
    );
    expect(signals?.projectStatuses).toEqual([
      { project: "Mac App roadmap", status: "QA passed" },
    ]);
  });

  it("categorises with the stale metadata when the inline fetch fails", async () => {
    processMetadata.mockRejectedValue(new Error("GitHub 502"));

    const signals = await service.resolveForEmail(
      USER_ID,
      EMAIL,
      thread(FETCHED_BEFORE_EMAIL),
    );

    expect(findOne).not.toHaveBeenCalled();
    expect(signals?.projectStatuses).toEqual([
      { project: "Mac App roadmap", status: "QA failed" },
    ]);
  });

  it("gives up on the fetch after the bounded timeout and proceeds", async () => {
    jest.useFakeTimers();
    processMetadata.mockReturnValue(new Promise(() => undefined));

    const pending = service.resolveForEmail(
      USER_ID,
      EMAIL,
      thread(FETCHED_BEFORE_EMAIL),
    );
    await jest.advanceTimersByTimeAsync(
      GITHUB_METADATA_INLINE_FETCH_TIMEOUT_MS + 1,
    );
    const signals = await pending;

    expect(signals?.projectStatuses).toEqual([
      { project: "Mac App roadmap", status: "QA failed" },
    ]);
    jest.useRealTimers();
  });

  it("returns null for mail that is not a GitHub notification", async () => {
    const signals = await service.resolveForEmail(
      USER_ID,
      { id: "email-2", from: "sam@example.com", subject: "Hi", body: "hello" },
      thread(FETCHED_BEFORE_EMAIL),
    );

    expect(processMetadata).not.toHaveBeenCalled();
    expect(signals).toBeNull();
  });
});
