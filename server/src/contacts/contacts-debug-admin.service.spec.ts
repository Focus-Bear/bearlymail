import { Repository } from "typeorm";

import { Contact } from "../database/entities/contact.entity";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { ContactsDebugAdminService } from "./contacts-debug-admin.service";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { SearchIndexHelper } from "./search-index.helper";

const makeNamelessContact = (
  id: string,
  email: string,
  contactFrequency: number,
): Contact =>
  ({
    id,
    provider: "gmail",
    providerId: `people/${id}`,
    email,
    name: undefined,
    firstName: undefined,
    lastName: undefined,
    isFavorite: false,
    contactFrequency,
    searchTokens: JSON.stringify(
      SearchIndexHelper.generateSearchTokens(
        SearchIndexHelper.extractEmailLocalPart(email),
        SearchIndexHelper.extractEmailDomain(email),
      ),
    ),
  }) as Contact;

describe("ContactsDebugAdminService.diagnoseSearch", () => {
  const candidates = [
    makeNamelessContact("mcdonald", "andrewmcdonaldcw@example.com", 40),
    makeNamelessContact("lam-po-tang", "andrew.lam-po-tang@example.org", 0),
  ];

  const buildService = (): ContactsDebugAdminService => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(candidates),
      getCount: jest.fn().mockResolvedValue(candidates.length),
    };
    const contactRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      query: jest.fn().mockResolvedValue([{ total: 2 }]),
    } as unknown as Repository<Contact>;
    const gmailContactsProvider = {
      isConnected: jest.fn().mockResolvedValue(false),
      searchContacts: jest.fn().mockResolvedValue([]),
    } as unknown as GmailContactsProvider;
    return new ContactsDebugAdminService(
      contactRepository,
      gmailContactsProvider,
      {} as UserEncryptionService,
    );
  };

  it("reports which query word failed the post-filter and what prod returns", async () => {
    const result = await buildService().diagnoseSearch("user-1", "andrew lam");

    const byId = new Map(result.sqlCandidates.map((row) => [row.id, row]));
    expect(byId.get("mcdonald")).toMatchObject({
      passesPostFilter: false,
      postFilterReason: '"lam" matched no name/email token',
      wouldSurviveTake8: false,
    });
    expect(byId.get("lam-po-tang")).toMatchObject({
      passesPostFilter: true,
      wouldSurviveTake8: true,
    });
  });
});
