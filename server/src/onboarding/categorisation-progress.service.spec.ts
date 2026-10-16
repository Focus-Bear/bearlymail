import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { STAR_COUNTS } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";
import { CategorisationProgressService } from "./categorisation-progress.service";

describe("CategorisationProgressService", () => {
  let service: CategorisationProgressService;
  let emailThreadRepository: { query: jest.Mock };

  beforeEach(async () => {
    emailThreadRepository = { query: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategorisationProgressService,
        {
          provide: getRepositoryToken(EmailThread),
          useValue: emailThreadRepository,
        },
      ],
    }).compile();
    service = module.get(CategorisationProgressService);
  });

  it("returns total and categorised counts for the user's triage threads", async () => {
    emailThreadRepository.query.mockResolvedValue([
      { total: 67, categorised: 42 },
    ]);

    await expect(service.getProgress("user-1")).resolves.toEqual({
      total: 67,
      categorised: 42,
    });
  });

  it("scopes the count to untriaged, non-archived threads", async () => {
    emailThreadRepository.query.mockResolvedValue([
      { total: 0, categorised: 0 },
    ]);

    await service.getProgress("user-1");

    const [sql, params] = emailThreadRepository.query.mock.calls[0];
    expect(sql).toContain('"isArchived" = false');
    expect(sql).toContain('"starCount" = $2');
    // Never decrypts or touches categoryId: NULL is a valid settled "Other".
    expect(sql).not.toContain("categoryId");
    expect(params).toEqual(["user-1", STAR_COUNTS.NONE]);
  });

  it("only counts a thread as categorised once a categoriser wrote its result or AI was deferred", async () => {
    emailThreadRepository.query.mockResolvedValue([
      { total: 0, categorised: 0 },
    ]);

    await service.getProgress("user-1");

    const [sql] = emailThreadRepository.query.mock.calls[0];
    const filter = sql.slice(sql.indexOf("FILTER"));
    // isProcessingPriority=false alone is not proof: failure paths clear it
    // without any categoriser having run.
    expect(filter).toContain('"isProcessingPriority" = false');
    expect(filter).toContain('"prioritySource" IS NOT NULL');
    expect(filter).toContain('"categorySource" IS NOT NULL');
    expect(filter).toContain('"aiProcessingDeferred" = true');
  });

  it("parses string counts returned by the pg driver", async () => {
    emailThreadRepository.query.mockResolvedValue([
      { total: "12", categorised: "5" },
    ]);

    await expect(service.getProgress("user-1")).resolves.toEqual({
      total: 12,
      categorised: 5,
    });
  });

  it("returns zeros when the query yields no row", async () => {
    emailThreadRepository.query.mockResolvedValue([]);

    await expect(service.getProgress("user-1")).resolves.toEqual({
      total: 0,
      categorised: 0,
    });
  });
});
