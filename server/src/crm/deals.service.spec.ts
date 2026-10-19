import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { Deal } from "../database/entities/deal.entity";
import { DealStage } from "../database/entities/deal-stage.entity";
import { DealsService, normalizeDealCurrency } from "./deals.service";

/**
 * The contacts table is unique on (userId, provider, providerId), NOT on email —
 * so the same email commonly exists as several contact records (e.g. Google
 * "contacts" + auto-created "other contacts"). getDealsForContactByEmail must
 * therefore gather deals across EVERY contact sharing the email, not just one.
 */
describe("DealsService.getDealsForContactByEmail", () => {
  let service: DealsService;

  const dealRepository = { find: jest.fn() };
  const contactRepository = { find: jest.fn(), findOne: jest.fn() };
  const dealStageRepository = {};

  const makeDeal = (id: string, contactId: string): Partial<Deal> => ({
    id,
    title: `Deal ${id}`,
    details: null,
    value: null,
    currency: "USD",
    expectedCloseDate: null,
    stageId: null,
    contactId,
    sortOrder: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: getRepositoryToken(Deal), useValue: dealRepository },
        {
          provide: getRepositoryToken(DealStage),
          useValue: dealStageRepository,
        },
        { provide: getRepositoryToken(Contact), useValue: contactRepository },
      ],
    }).compile();
    service = module.get<DealsService>(DealsService);
  });

  it("returns deals linked to any contact record sharing the email (duplicate contacts)", async () => {
    // Same email → two contact records; the deal is linked to the SECOND one.
    contactRepository.find.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    dealRepository.find.mockImplementation(
      (options: { where: { contactId: string } }) =>
        Promise.resolve(
          options.where.contactId === "c2" ? [makeDeal("d1", "c2")] : [],
        ),
    );

    const result = await service.getDealsForContactByEmail(
      "user-1",
      "person@example.com",
    );

    expect(result.map((deal) => deal.id)).toEqual(["d1"]);
  });

  it("returns an empty array when no contact has that email", async () => {
    contactRepository.find.mockResolvedValue([]);

    const result = await service.getDealsForContactByEmail(
      "user-1",
      "nobody@example.com",
    );

    expect(result).toEqual([]);
    expect(dealRepository.find).not.toHaveBeenCalled();
  });
});

describe("normalizeDealCurrency", () => {
  it("accepts a three-letter code and stores it upper-case", () => {
    expect(normalizeDealCurrency("AUD")).toBe("AUD");
    expect(normalizeDealCurrency(" eur ")).toBe("EUR");
  });

  it.each([
    ["markup from the pentest", "<img src=x onerror=alert(1)>"],
    ["a contact type", "Customer"],
    ["too short", "US"],
    ["digits", "123"],
    ["empty", ""],
    ["not a string", 42],
  ])("rejects %s", (_label, currency) => {
    expect(() => normalizeDealCurrency(currency)).toThrow(BadRequestException);
  });
});

/** Pentest finding (issue #324): an invalid currency blanked the Deals page. */
describe("DealsService currency validation", () => {
  let service: DealsService;
  const dealRepository = { findOne: jest.fn(), save: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: getRepositoryToken(Deal), useValue: dealRepository },
        { provide: getRepositoryToken(DealStage), useValue: {} },
        { provide: getRepositoryToken(Contact), useValue: {} },
      ],
    }).compile();
    service = module.get<DealsService>(DealsService);
  });

  it("refuses to save a deal update with an invalid currency", async () => {
    dealRepository.findOne.mockResolvedValue({ id: "d1", currency: "USD" });

    await expect(
      service.updateDeal("user-1", "d1", {
        currency: "<img src=x onerror=alert(1)>",
      }),
    ).rejects.toThrow(BadRequestException);
    expect(dealRepository.save).not.toHaveBeenCalled();
  });
});
