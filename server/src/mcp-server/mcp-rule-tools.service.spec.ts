import { BadRequestException } from "@nestjs/common";
import { Repository } from "typeorm";

import { CreateCompositeCategoryRuleDto } from "../category-rules/dto/create-composite-category-rule.dto";
import { PatchCategoryRuleDto } from "../category-rules/dto/patch-category-rule.dto";
import { AuditLog } from "../database/entities/audit-log.entity";
import {
  BUG_RULE_ID,
  BUGS_ID,
  callContext,
  LEGACY_RULE_ID,
  OTHER_USER,
  OTHER_USERS_CATEGORY_ID,
  OTHER_USERS_RULE_ID,
  OWNER,
  QA_PASSED_ID,
  QA_RULE_ID,
  RULES_BY_USER,
  SETTINGS_AUDIT,
  settingsServiceMocks,
} from "./__fixtures__/mcp-settings.fixture";
import { McpRuleToolsService } from "./mcp-rule-tools.service";
import { McpToolInputError } from "./mcp-tool-args";

const QA_CONDITIONS = {
  fromMatchesAny: ["notifications@github.com"],
  subjectContainsAny: ["Focus-Bear/"],
  bodyContainsAny: ["Pass ✅"],
  bodyNotContainsAny: ["Fail"],
};

describe("McpRuleToolsService", () => {
  let mocks: ReturnType<typeof settingsServiceMocks>;
  let service: McpRuleToolsService;

  beforeEach(() => {
    mocks = settingsServiceMocks();
    mocks.categoryRulesService.createCompositeRule.mockImplementation(
      async () => ({ ...RULES_BY_USER[OWNER][0], id: "new-rule" }),
    );
    mocks.categoryRulesService.updateCategoryRule.mockImplementation(
      async (_userId: string, ruleId: string) =>
        RULES_BY_USER[OWNER].find((rule) => rule.id === ruleId) ?? null,
    );
    service = new McpRuleToolsService(
      mocks.asCategoryRulesService,
      mocks.asContextService,
      mocks.auditLogs as unknown as Repository<AuditLog>,
    );
  });

  describe("listRules / getRule", () => {
    it("lists the caller's rules with filters, in v3 field names whatever the stored version", async () => {
      const all = await service.listRules(callContext(OWNER), {});
      expect(mocks.categoryRulesService.listRules).toHaveBeenCalledWith(OWNER);
      expect(all.count).toBe(3);
      expect(all.rules[0].conditions).toEqual({
        fromMatchesAny: ["notifications@github.com"],
        subjectContainsAny: ["Focus-Bear/"],
        bodyContainsAny: ["QA Status"],
        bodyNotContainsAny: ["Fail"],
      });
      expect(all.rules[2]).toMatchObject({
        kind: "legacy",
        conditions: null,
        legacyMatch: { type: "exact_sender", pattern: "bugs@example.com" },
      });

      const disabledBugRules = await service.listRules(callContext(OWNER), {
        categoryId: BUGS_ID,
        isEnabled: false,
      });
      expect(disabledBugRules.rules.map((rule) => rule.ruleId)).toEqual([
        BUG_RULE_ID,
      ]);
    });

    it("can't read another user's rule (owner control: they can)", async () => {
      await expect(
        service.getRule(callContext(OTHER_USER), {
          ruleId: OTHER_USERS_RULE_ID,
        }),
      ).resolves.toMatchObject({ rule: { ruleId: OTHER_USERS_RULE_ID } });
      await expect(
        service.getRule(callContext(OWNER), { ruleId: OTHER_USERS_RULE_ID }),
      ).rejects.toThrow(`No rule found with id ${OTHER_USERS_RULE_ID}`);
    });
  });

  describe("createRule", () => {
    it("validates with the web DTO and creates through CategoryRulesService", async () => {
      const result = await service.createRule(callContext(OWNER), {
        categoryId: QA_PASSED_ID,
        conditions: { ...QA_CONDITIONS, githubAuthorKind: null },
      });

      const [userId, dto] =
        mocks.categoryRulesService.createCompositeRule.mock.calls[0];
      expect(userId).toBe(OWNER);
      expect(dto).toBeInstanceOf(CreateCompositeCategoryRuleDto);
      expect(dto).toMatchObject({
        categoryId: QA_PASSED_ID,
        categoryName: "✅ Github QA passed issues",
        senderMatchesAny: ["notifications@github.com"],
        bodyContainsAny: ["Pass ✅"],
      });
      expect(dto).not.toHaveProperty("githubAuthorKind");
      expect(result.created.ruleId).toBe("new-rule");
      expect(mocks.auditLogs.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: SETTINGS_AUDIT.RULE_CREATED }),
      );
    });

    it("reports DTO errors in MCP field names", async () => {
      await expect(
        service.createRule(callContext(OWNER), {
          categoryId: QA_PASSED_ID,
          conditions: { ...QA_CONDITIONS, fromMatchesAny: [] },
        }),
      ).rejects.toThrow(/fromMatchesAny/);
      await expect(
        service.createRule(callContext(OWNER), {
          categoryId: QA_PASSED_ID,
          conditions: { ...QA_CONDITIONS, v: 3 },
        }),
      ).rejects.toThrow("property v should not exist");
      expect(
        mocks.categoryRulesService.createCompositeRule,
      ).not.toHaveBeenCalled();
    });

    it("passes the service's own rejection back as a readable tool error", async () => {
      mocks.categoryRulesService.createCompositeRule.mockRejectedValue(
        new BadRequestException(
          "A composite rule must include at least one subject or body NOT-contains phrase",
        ),
      );
      await expect(
        service.createRule(callContext(OWNER), {
          categoryId: QA_PASSED_ID,
          conditions: { ...QA_CONDITIONS, bodyNotContainsAny: [] },
        }),
      ).rejects.toEqual(
        new McpToolInputError(
          "A composite rule must include at least one subject or body NOT-contains phrase",
        ),
      );
    });

    it("can't file a rule into another user's category", async () => {
      await expect(
        service.createRule(callContext(OWNER), {
          categoryId: OTHER_USERS_CATEGORY_ID,
          conditions: QA_CONDITIONS,
        }),
      ).rejects.toThrow(`No category found with id ${OTHER_USERS_CATEGORY_ID}`);
      expect(
        mocks.categoryRulesService.createCompositeRule,
      ).not.toHaveBeenCalled();
    });
  });

  describe("updateRule", () => {
    it("merges a partial conditions change over the rule's current conditions", async () => {
      const result = await service.updateRule(callContext(OWNER), {
        ruleId: QA_RULE_ID,
        conditions: {
          bodyContainsAny: ["Pass ✅"],
          subjectNotContainsAny: ["PR"],
        },
      });

      const [userId, ruleId, dto] =
        mocks.categoryRulesService.updateCategoryRule.mock.calls[0];
      expect([userId, ruleId]).toEqual([OWNER, QA_RULE_ID]);
      expect(dto).toBeInstanceOf(PatchCategoryRuleDto);
      expect(dto.compositeSpec).toMatchObject({
        senderMatchesAny: ["notifications@github.com"],
        subjectContainsAny: ["Focus-Bear/"],
        bodyContainsAny: ["Pass ✅"],
        bodyNotContainsAny: ["Fail"],
        subjectNotContainsAny: ["PR"],
      });
      expect(result.before.ruleId).toBe(QA_RULE_ID);
      expect(mocks.auditLogs.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: SETTINGS_AUDIT.RULE_UPDATED,
          metadata: expect.objectContaining({ before: result.before }),
        }),
      );
    });

    it("removes an optional condition passed as null", async () => {
      await service.updateRule(callContext(OWNER), {
        ruleId: BUG_RULE_ID,
        conditions: { githubAuthorKind: null },
      });
      const dto =
        mocks.categoryRulesService.updateCategoryRule.mock.calls[0][2];
      expect(dto.compositeSpec).not.toHaveProperty("githubAuthorKind");
      expect(dto.compositeSpec.subjectNotContainsAny).toEqual(["PR"]);
    });

    it("can move or toggle a legacy rule but not edit its conditions", async () => {
      await service.updateRule(callContext(OWNER), {
        ruleId: LEGACY_RULE_ID,
        isEnabled: false,
        categoryId: QA_PASSED_ID,
      });
      expect(
        mocks.categoryRulesService.updateCategoryRule,
      ).toHaveBeenCalledWith(
        OWNER,
        LEGACY_RULE_ID,
        expect.objectContaining({ isEnabled: false, categoryId: QA_PASSED_ID }),
      );
      await expect(
        service.updateRule(callContext(OWNER), {
          ruleId: LEGACY_RULE_ID,
          conditions: { bodyContainsAny: ["x"] },
        }),
      ).rejects.toThrow(/legacy/);
    });

    it("can't change another user's rule or move a rule into their category", async () => {
      await expect(
        service.updateRule(callContext(OWNER), {
          ruleId: OTHER_USERS_RULE_ID,
          isEnabled: false,
        }),
      ).rejects.toThrow(`No rule found with id ${OTHER_USERS_RULE_ID}`);
      await expect(
        service.updateRule(callContext(OWNER), {
          ruleId: QA_RULE_ID,
          categoryId: OTHER_USERS_CATEGORY_ID,
        }),
      ).rejects.toThrow(`No category found with id ${OTHER_USERS_CATEGORY_ID}`);
      expect(
        mocks.categoryRulesService.updateCategoryRule,
      ).not.toHaveBeenCalled();
    });

    it("needs something to change and validates the merged conditions", async () => {
      await expect(
        service.updateRule(callContext(OWNER), { ruleId: QA_RULE_ID }),
      ).rejects.toThrow("Pass at least one of");
      await expect(
        service.updateRule(callContext(OWNER), {
          ruleId: QA_RULE_ID,
          conditions: { subjectContainsAny: "Focus-Bear/" },
        }),
      ).rejects.toThrow(/conditions\.subjectContainsAny/);
      expect(
        mocks.categoryRulesService.updateCategoryRule,
      ).not.toHaveBeenCalled();
    });
  });

  describe("setRulesEnabled", () => {
    it("dry run reports what would change without changing anything", async () => {
      const result = await service.setRulesEnabled(callContext(OWNER), {
        ruleIds: [QA_RULE_ID, BUG_RULE_ID, OTHER_USERS_RULE_ID],
        isEnabled: false,
        dryRun: true,
      });
      expect(result).toEqual({
        dryRun: true,
        isEnabled: false,
        ruleIdsChanged: [QA_RULE_ID],
        alreadyThatWay: [BUG_RULE_ID],
        notFound: [OTHER_USERS_RULE_ID],
      });
      expect(
        mocks.categoryRulesService.updateCategoryRule,
      ).not.toHaveBeenCalled();
      expect(mocks.auditLogs.save).not.toHaveBeenCalled();
    });

    it("toggles only the caller's rules that need it", async () => {
      await service.setRulesEnabled(callContext(OWNER), {
        ruleIds: [QA_RULE_ID, BUG_RULE_ID, OTHER_USERS_RULE_ID],
        isEnabled: true,
      });
      expect(
        mocks.categoryRulesService.updateCategoryRule,
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.categoryRulesService.updateCategoryRule,
      ).toHaveBeenCalledWith(OWNER, BUG_RULE_ID, { isEnabled: true });
    });

    it("requires isEnabled and a bounded list of ids", async () => {
      await expect(
        service.setRulesEnabled(callContext(OWNER), { ruleIds: [QA_RULE_ID] }),
      ).rejects.toThrow("`isEnabled` is required");
      await expect(
        service.setRulesEnabled(callContext(OWNER), {
          ruleIds: [],
          isEnabled: true,
        }),
      ).rejects.toThrow("`ruleIds` must be an array of 1 to 50 ids");
    });
  });

  describe("deleteRules", () => {
    it("dry run returns the rules it would delete and deletes nothing", async () => {
      const result = await service.deleteRules(callContext(OWNER), {
        ruleIds: [LEGACY_RULE_ID],
        dryRun: true,
      });
      expect(result).toMatchObject({
        dryRun: true,
        wouldDelete: [{ ruleId: LEGACY_RULE_ID }],
        notFound: [],
      });
      expect(mocks.categoryRulesService.deleteRule).not.toHaveBeenCalled();
    });

    it("deletes the caller's rules, skips another user's, and audits the full rules", async () => {
      const result = await service.deleteRules(callContext(OWNER), {
        ruleIds: [QA_RULE_ID, OTHER_USERS_RULE_ID],
      });
      expect(mocks.categoryRulesService.deleteRule).toHaveBeenCalledTimes(1);
      expect(mocks.categoryRulesService.deleteRule).toHaveBeenCalledWith(
        OWNER,
        QA_RULE_ID,
      );
      expect(result.notFound).toEqual([OTHER_USERS_RULE_ID]);
      expect(mocks.auditLogs.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: SETTINGS_AUDIT.RULES_DELETED,
          metadata: expect.objectContaining({
            before: [expect.objectContaining({ ruleId: QA_RULE_ID })],
          }),
        }),
      );
    });

    it("owner control: the other user can delete their own rule", async () => {
      await service.deleteRules(callContext(OTHER_USER), {
        ruleIds: [OTHER_USERS_RULE_ID],
      });
      expect(mocks.categoryRulesService.deleteRule).toHaveBeenCalledWith(
        OTHER_USER,
        OTHER_USERS_RULE_ID,
      );
    });

    it("rejects ids that aren't UUIDs", async () => {
      await expect(
        service.deleteRules(callContext(OWNER), { ruleIds: ["rule-1"] }),
      ).rejects.toThrow("aren't BearlyMail ids: rule-1");
    });
  });
});
