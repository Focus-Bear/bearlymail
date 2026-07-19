import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { SeedTestDataService } from "./seed-test-data.service";

function makeQueryBuilder(affected: number) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ["delete", "from", "where", "andWhere"]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.execute = jest.fn().mockResolvedValue({ affected });
  return builder;
}

function makeRepo(idField: string, affected = 0) {
  let counter = 0;
  const withId = (data: Record<string, unknown>) => ({
    ...data,
    [idField]: `${idField}-${counter++}`,
  });
  return {
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    // Supports both single-entity and bulk (array) saves.
    save: jest.fn((data: Record<string, unknown> | Record<string, unknown>[]) =>
      Promise.resolve(Array.isArray(data) ? data.map(withId) : withId(data)),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => makeQueryBuilder(affected)),
  };
}

describe("SeedTestDataService", () => {
  let service: SeedTestDataService;
  let emailRepo: ReturnType<typeof makeRepo>;
  let threadRepo: ReturnType<typeof makeRepo>;
  let contextRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    emailRepo = makeRepo("id");
    threadRepo = makeRepo("id", 7);
    contextRepo = makeRepo("contextId");

    const moduleRef = await Test.createTestingModule({
      providers: [
        SeedTestDataService,
        { provide: getRepositoryToken(Email), useValue: emailRepo },
        { provide: getRepositoryToken(EmailThread), useValue: threadRepo },
        { provide: getRepositoryToken(UserContext), useValue: contextRepo },
      ],
    }).compile();

    service = moduleRef.get(SeedTestDataService);
  });

  it("seeds exactly 150 threads and emails, all prefixed seedtest-", async () => {
    const result = await service.seed("user-1", "product-manager");

    expect(result.seeded).toBe(150);
    // Bulk save: threads and emails are each persisted in a single call.
    expect(threadRepo.save).toHaveBeenCalledTimes(1);
    expect(emailRepo.save).toHaveBeenCalledTimes(1);
    expect(threadRepo.create).toHaveBeenCalledTimes(150);
    expect(emailRepo.create).toHaveBeenCalledTimes(150);

    const threadArgs = threadRepo.create.mock.calls.map((call) => call[0]);
    expect(
      threadArgs.every((thread) =>
        String(thread.threadId).startsWith("seedtest-"),
      ),
    ).toBe(true);
    const emailArgs = emailRepo.create.mock.calls.map((call) => call[0]);
    expect(
      emailArgs.every((item) => String(item.messageId).startsWith("seedtest-")),
    ).toBe(true);
    // Every email is summarised; emailThreadId is wired to the saved thread.
    expect(
      emailArgs.every(
        (item) => typeof item.summary === "string" && item.summary,
      ),
    ).toBe(true);
    expect(emailArgs.every((item) => Boolean(item.emailThreadId))).toBe(true);
  });

  it.each(["product-manager", "founder", "engineering-manager"] as const)(
    "gives every seeded email in %s a non-empty body (regression: Email.body is NOT NULL and EncryptionHelper.encrypt('') returns null)",
    async (persona) => {
      await service.seed("user-1", persona);

      const emailArgs = emailRepo.create.mock.calls.map((call) => call[0]);
      const emptyBodies = emailArgs.filter(
        (item) => !item.body || typeof item.body !== "string",
      );
      expect(emptyBodies).toHaveLength(0);
    },
  );

  it("creates the persona's categories with a seedtest_ categoryKey and links categoryId", async () => {
    await service.seed("user-1", "founder");

    const categoryArgs = contextRepo.create.mock.calls.map((call) => call[0]);
    expect(categoryArgs.length).toBeGreaterThan(0);
    expect(
      categoryArgs.every(
        (category) =>
          category.contextKey === ContextKey.EMAIL_CATEGORY &&
          String(category.categoryKey).startsWith("seedtest_"),
      ),
    ).toBe(true);

    // At least some threads are bucketed into a real category (categoryId set).
    const threadArgs = threadRepo.create.mock.calls.map((call) => call[0]);
    expect(threadArgs.some((thread) => thread.categoryId)).toBe(true);
    // And some land in "Other" (null categoryId).
    expect(threadArgs.some((thread) => thread.categoryId === null)).toBe(true);
  });

  it("replaces existing data: seed runs deleteAll first", async () => {
    await service.seed("user-1", "engineering-manager");
    // deleteAll issues delete query builders against all three repos.
    expect(emailRepo.createQueryBuilder).toHaveBeenCalled();
    expect(threadRepo.createQueryBuilder).toHaveBeenCalled();
    expect(contextRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it("deleteAll returns the number of seeded threads removed", async () => {
    const result = await service.deleteAll("user-1");
    expect(result.deleted).toBe(7);
  });
});
