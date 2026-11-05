import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { ContactsController } from "../contacts/contacts.controller";
import { DealsController } from "../crm/deals.controller";
import { CrmPlanGuard, PLAN_EXCLUDES_CRM_CODE } from "./crm-plan.guard";
import { SubscriptionsService } from "./subscriptions.service";

const USER_ID = "user-123";

const contextFor = (request: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const guardsOn = (target: object): unknown[] =>
  Reflect.getMetadata(GUARDS_METADATA, target) ?? [];

describe("CrmPlanGuard", () => {
  const hasCrmAccess = jest.fn<Promise<boolean>, [string]>();
  const guard = new CrmPlanGuard({
    hasCrmAccess,
  } as unknown as SubscriptionsService);

  afterEach(() => hasCrmAccess.mockReset());

  it("lets a user whose plan includes the CRM through", async () => {
    hasCrmAccess.mockResolvedValue(true);
    await expect(
      guard.canActivate(contextFor({ user: { userId: USER_ID } })),
    ).resolves.toBe(true);
    expect(hasCrmAccess).toHaveBeenCalledWith(USER_ID);
  });

  it("rejects a plan without the CRM with a code the client recognises", async () => {
    hasCrmAccess.mockResolvedValue(false);
    const rejection = guard.canActivate(
      contextFor({ user: { userId: USER_ID } }),
    );
    await expect(rejection).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rejection).rejects.toMatchObject({
      response: { code: PLAN_EXCLUDES_CRM_CODE },
    });
  });

  it("rejects an unauthenticated request without checking the plan", async () => {
    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(hasCrmAccess).not.toHaveBeenCalled();
  });
});

describe("CRM endpoint gating", () => {
  it("guards every deals endpoint", () => {
    expect(guardsOn(DealsController)).toContain(CrmPlanGuard);
  });

  it.each([
    "getCustomFields",
    "createCustomField",
    "updateCustomField",
    "deleteCustomField",
    "createContactType",
    "updateContactType",
    "deleteContactType",
    "getContactDetail",
    "getContactThreads",
    "updateContact",
    "addNote",
    "updateNote",
    "deleteNote",
    "setCustomFieldValue",
    "getAllContacts",
    "createContact",
    "toggleFavorite",
    "deleteContact",
  ])("guards the CRM contacts endpoint %s", (method) => {
    expect(guardsOn(ContactsController.prototype[method])).toContain(
      CrmPlanGuard,
    );
  });

  it.each([
    "searchContacts",
    "getFrequentContacts",
    "getContactTypes",
    "getContactTypesByEmails",
    "syncContacts",
  ])("leaves the address-book endpoint %s on every plan", (method) => {
    expect(guardsOn(ContactsController.prototype[method])).not.toContain(
      CrmPlanGuard,
    );
  });
});
