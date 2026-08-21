import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { Deal } from "../database/entities/deal.entity";
import { DealStage } from "../database/entities/deal-stage.entity";
import { DealsService } from "./deals.service";

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
