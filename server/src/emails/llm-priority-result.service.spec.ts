import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { GitHubCategoryOverrideService } from "../github/github-category-override.service";
import { ProtoCategoriesService } from "../proto-categories/proto-categories.service";
import { UsersService } from "../users/users.service";
import { LLMPriorityResultService } from "./llm-priority-result.service";

type ServiceWithPrivate = LLMPriorityResultService & {
  maybeApplyEmergencyDelivery: (
    emailThreadId: string,
    userId: string,
    finalScore: number,
    starCount: number,
    isBatched: boolean,
  ) => Promise<void>;
};

describe("LLMPriorityResultService - maybeApplyEmergencyDelivery", () => {
  let service: ServiceWithPrivate;
  let emailThreadRepository: jest.Mocked<Repository<EmailThread>>;

  beforeEach(async () => {
    emailThreadRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<EmailThread>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMPriorityResultService,
        {
          provide: getRepositoryToken(Email),
          useValue: {
            update: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: emailThreadRepository,
        },
        {
          provide: ProtoCategoriesService,
          useValue: {
            findMatchingProtoCategory: jest.fn().mockResolvedValue(null),
            findMatchingFullCategory: jest.fn().mockResolvedValue(null),
            assignThreadToProtoCategory: jest.fn(),
            createAndAssignToThread: jest.fn(),
          },
        },
        {
          provide: GitHubCategoryOverrideService,
          useValue: {
            resolveOverrideCategoryId: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({ githubUsername: null }),
          },
        },
      ],
    }).compile();

    service = module.get<LLMPriorityResultService>(
      LLMPriorityResultService,
    ) as unknown as ServiceWithPrivate;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("non-starred threads", () => {
    it("un-batches when score meets HIGH_THRESHOLD (75)", async () => {
      await service.maybeApplyEmergencyDelivery(
        "thread-1",
        "user-1",
        PRIORITY_SCORES.HIGH_THRESHOLD,
        0,
        true,
      );

      expect(emailThreadRepository.update).toHaveBeenCalledWith(
        { id: "thread-1", userId: "user-1" },
        expect.objectContaining({
          isBatched: false,
          wasDeliveredEarly: true,
          batchDecisionReason: expect.stringContaining("Emergency delivery"),
        }),
      );
    });

    it("does NOT un-batch when score is below HIGH_THRESHOLD", async () => {
      await service.maybeApplyEmergencyDelivery(
        "thread-1",
        "user-1",
        PRIORITY_SCORES.HIGH_THRESHOLD - 1,
        0,
        true,
      );

      expect(emailThreadRepository.update).not.toHaveBeenCalled();
    });
  });

  describe("starred threads", () => {
    describe("already delivered (isBatched=false, was visible in Action/Follow-Up)", () => {
      it("does NOT update — thread was already delivered immediately", async () => {
        await service.maybeApplyEmergencyDelivery(
          "thread-1",
          "user-1",
          90,
          1,
          false,
        );

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });
    });

    describe("batched (isBatched=true, was snoozed when email arrived)", () => {
      it("un-batches when score meets HIGH_THRESHOLD (75)", async () => {
        await service.maybeApplyEmergencyDelivery(
          "thread-1",
          "user-1",
          PRIORITY_SCORES.HIGH_THRESHOLD,
          1,
          true,
        );

        expect(emailThreadRepository.update).toHaveBeenCalledWith(
          { id: "thread-1", userId: "user-1" },
          expect.objectContaining({
            isBatched: false,
            wasDeliveredEarly: true,
            batchDecisionReason: expect.stringContaining("Emergency delivery"),
          }),
        );
      });

      it("does NOT un-batch when score is below HIGH_THRESHOLD (74)", async () => {
        await service.maybeApplyEmergencyDelivery(
          "thread-1",
          "user-1",
          PRIORITY_SCORES.HIGH_THRESHOLD - 1,
          1,
          true,
        );

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });

      it("does NOT un-batch when score is at MEDIUM_THRESHOLD (50) — below urgent threshold", async () => {
        await service.maybeApplyEmergencyDelivery(
          "thread-1",
          "user-1",
          PRIORITY_SCORES.MEDIUM_THRESHOLD,
          2,
          true,
        );

        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });

      it("does NOT un-batch at score 60 — same threshold as non-starred (both need HIGH_THRESHOLD)", async () => {
        await service.maybeApplyEmergencyDelivery(
          "thread-starred-batched",
          "user-1",
          60,
          1,
          true,
        );
        expect(emailThreadRepository.update).not.toHaveBeenCalled();

        await service.maybeApplyEmergencyDelivery(
          "thread-unstarred",
          "user-1",
          60,
          0,
          true,
        );
        expect(emailThreadRepository.update).not.toHaveBeenCalled();
      });
    });
  });
});
