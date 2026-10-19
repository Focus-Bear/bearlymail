import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { QUERY_LIMITS } from "../constants/query-limits";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { ContactCrmService } from "./contact-crm.service";
import { ContactsService } from "./contacts.service";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { Office365ContactsProvider } from "./providers/office365-contacts.provider";
import { SearchIndexHelper } from "./search-index.helper";

/** Real blind-index tokens, generated from the same fields `upsertContacts` indexes. */
const withProductionTokens = (contact: Contact): Contact => ({
  ...contact,
  searchTokens: JSON.stringify(
    SearchIndexHelper.generateSearchTokens(
      contact.name,
      contact.firstName,
      contact.lastName,
      SearchIndexHelper.extractEmailLocalPart(contact.email),
      SearchIndexHelper.extractEmailDomain(contact.email),
    ),
  ),
});

/**
 * Regression tests for the #2030 contact-search ranking bug: a zero-frequency
 * exact match (e.g. "Casey Gold") was buried below hundreds of incidental
 * single-trigram matches by `ORDER BY contactFrequency` and then dropped
 * entirely by truncating to the small caller `limit` *before* the visible-field
 * filter ran. The fix ranks candidates by token-match relevance and fetches a
 * generous pool, filtering before the final slice.
 */
describe("ContactsService.searchContacts ranking (#2030)", () => {
  let service: ContactsService;
  let qb: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };
  let contactRepository: { findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let gmailContactsProvider: { searchContacts: jest.Mock };

  const makeContact = (overrides: Partial<Contact>): Contact =>
    ({
      id: "id",
      email: "x@example.com",
      name: "X",
      firstName: "X",
      lastName: "",
      isFavorite: false,
      contactFrequency: 0,
      ...overrides,
    }) as Contact;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    contactRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    gmailContactsProvider = { searchContacts: jest.fn().mockResolvedValue([]) };
    const office365ContactsProvider = {
      searchContacts: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: getRepositoryToken(Contact), useValue: contactRepository },
        { provide: getRepositoryToken(Email), useValue: {} },
        { provide: GmailContactsProvider, useValue: gmailContactsProvider },
        {
          provide: Office365ContactsProvider,
          useValue: office365ContactsProvider,
        },
        { provide: ContactCrmService, useValue: {} },
      ],
    }).compile();

    service = module.get(ContactsService);
  });

  it("returns a zero-frequency exact match that the DB ranks first by relevance", async () => {
    // The DB now orders by token-match relevance, so the exact match comes back
    // at the head of the pool despite contactFrequency 0. The service must keep
    // it through the visible-field filter and final slice.
    const exact = makeContact({
      id: "kyriakos",
      email: "casey@example.com",
      name: "Casey Gold",
      firstName: "Casey",
      lastName: "Gold",
      contactFrequency: 0,
    });
    // Incidental contacts share only a trigram (e.g. "cas"/"c"), never the
    // full "casey" — none of their visible fields contain the query.
    const incidental = Array.from({ length: 50 }, (_, i) =>
      makeContact({
        id: `incidental-${i}`,
        email: `person${i}@example.com`,
        name: `Person ${i}`,
        contactFrequency: 5,
      }),
    );
    qb.getMany.mockResolvedValue([exact, ...incidental]);

    const results = await service.searchContacts("user-1", "casey", 8);

    expect(results.map((result) => result.email)).toContain(
      "casey@example.com",
    );
  });

  it("fetches the relevance-ranked candidate pool, not just the caller's limit", async () => {
    qb.getMany.mockResolvedValue([]);

    await service.searchContacts("user-1", "casey", 8);

    // Truncating to `limit` (8) before filtering was the bug; we must fetch the
    // larger pool so genuine matches below the cut still survive.
    expect(qb.take).toHaveBeenCalledWith(
      QUERY_LIMITS.CONTACTS_SEARCH_CANDIDATE_POOL,
    );
    expect(qb.take).not.toHaveBeenCalledWith(8);
  });

  it("orders by token-match relevance before contactFrequency", async () => {
    qb.getMany.mockResolvedValue([]);

    await service.searchContacts("user-1", "casey", 8);

    // Primary sort must be the relevance score (a CASE-sum expression), so an
    // exact match outranks a high-frequency one-trigram coincidence.
    const orderByArg = qb.orderBy.mock.calls[0]?.[0] as string;
    expect(orderByArg).toContain("CASE WHEN");
    expect(qb.addOrderBy).toHaveBeenCalledWith(
      "contact.contactFrequency",
      "DESC",
    );
  });

  it("filters out candidates whose visible fields do not contain the query", async () => {
    // A contact that matched only on a tokenized internal field (no visible
    // field contains the query) must not leak into results.
    const tokenOnly = makeContact({
      id: "token-only",
      email: "unrelated@example.com",
      name: "Unrelated Person",
      firstName: "Unrelated",
      lastName: "Person",
      contactFrequency: 99,
    });
    qb.getMany.mockResolvedValue([tokenOnly]);

    const results = await service.searchContacts("user-1", "casey", 8);

    expect(results).toHaveLength(0);
  });

  describe("nameless contacts matched on email tokens", () => {
    const lamPoTang = makeContact({
      id: "lam-po-tang",
      email: "andrew.lam-po-tang@example.org",
      name: undefined,
      firstName: undefined,
      lastName: undefined,
      contactFrequency: 0,
    });
    const mcdonald = makeContact({
      id: "mcdonald",
      email: "andrewmcdonaldcw@example.com",
      name: undefined,
      firstName: undefined,
      lastName: undefined,
      contactFrequency: 40,
    });
    const andrewLin = makeContact({
      id: "andrew-lin",
      email: "andrew.lin@example.net",
      name: "Andrew Lin",
      firstName: "Andrew",
      lastName: "Lin",
      contactFrequency: 25,
    });
    const lamOnly = makeContact({
      id: "lam-only",
      email: "lam.andrew@example.com",
      name: undefined,
      firstName: undefined,
      lastName: undefined,
      contactFrequency: 90,
    });

    it("returns andrew.lam-po-tang for 'andrew lam' even with no name and zero frequency", async () => {
      qb.getMany.mockResolvedValue(
        [mcdonald, andrewLin, lamPoTang].map(withProductionTokens),
      );

      const results = await service.searchContacts("user-1", "andrew lam", 8);

      expect(results.map((result) => result.id)).toEqual(["lam-po-tang"]);
    });

    it("ranks in-order matches above out-of-order ones regardless of frequency", async () => {
      // SQL hands the frequent out-of-order match back first; the in-memory
      // ranking must still put the in-order match on top.
      qb.getMany.mockResolvedValue(
        [lamOnly, mcdonald, lamPoTang].map(withProductionTokens),
      );

      const results = await service.searchContacts("user-1", "andrew lam", 8);

      expect(results.map((result) => result.id)).toEqual([
        "lam-po-tang",
        "lam-only",
      ]);
    });

    it("ranks by blind-index token overlap, then frequency, for single-word queries", async () => {
      qb.getMany.mockResolvedValue(
        [mcdonald, andrewLin, lamPoTang].map(withProductionTokens),
      );

      const results = await service.searchContacts("user-1", "andrew", 8);

      // Every contact prefix-matches "andrew"; the token counts tie, so
      // frequency breaks the tie.
      expect(results.map((result) => result.id)).toEqual([
        "mcdonald",
        "andrew-lin",
        "lam-po-tang",
      ]);
    });
  });
});
