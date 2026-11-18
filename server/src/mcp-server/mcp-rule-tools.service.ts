import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import type { CategoryRuleDto } from "../category-rules/category-rules.types";
import { CreateCompositeCategoryRuleDto } from "../category-rules/dto/create-composite-category-rule.dto";
import { PatchCategoryRuleDto } from "../category-rules/dto/patch-category-rule.dto";
import { MCP_SETTINGS } from "../constants/mcp-server.constants";
import { ContextService } from "../context/context.service";
import { AuditLog } from "../database/entities/audit-log.entity";
import { McpCallContext } from "./mcp-server.types";
import {
  filterCategories,
  findCategory,
  indexCategories,
  McpCategory,
  McpRuleConditions,
  recordSettingsAudit,
  toRuleConditions,
  toRuleView,
} from "./mcp-settings-views";
import {
  McpToolInputError,
  optionalBoolean,
  optionalObject,
  requiredId,
  requiredIdList,
  ToolArgs,
  validateAsDto,
  withServiceRejectionsAsInputErrors,
} from "./mcp-tool-args";

const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = MCP_SETTINGS;

/** The web DTOs call the sender list `senderMatchesAny`; the stored v3 spec (and MCP) say `fromMatchesAny`. */
const DTO_SENDER_FIELD = "senderMatchesAny";
const MCP_SENDER_FIELD = "fromMatchesAny";
/** Web DTO names that appear in validation messages, and what the MCP caller called them. */
const DTO_TO_MCP_FIELD_NAMES: ReadonlyArray<[string, string]> = [
  [DTO_SENDER_FIELD, MCP_SENDER_FIELD],
  ["compositeSpec", "conditions"],
];

/** null means "no such condition", so it's dropped rather than handed to the normaliser. */
function withoutNulls(conditions: ToolArgs): ToolArgs {
  return Object.fromEntries(
    Object.entries(conditions).filter(([, value]) => value !== null),
  );
}

/** A null in a partial `conditions` update clears that field. */
function mergeConditions(
  current: McpRuleConditions,
  changes: ToolArgs,
): ToolArgs {
  const merged: ToolArgs = { ...current, ...changes };
  if ("notificationSubtypeAny" in changes) {
    // The normaliser unions the single and set forms; replacing the set must drop the old single one.
    delete merged.notificationSubtype;
  }
  return withoutNulls(merged);
}

/** Conditions in MCP field names → the web DTO's field names. */
function toDtoFields(conditions: ToolArgs): ToolArgs {
  const { [MCP_SENDER_FIELD]: senders, ...rest } = conditions;
  return { ...rest, [DTO_SENDER_FIELD]: senders };
}

/** Validation and service messages name the web DTO's fields; say them the way the MCP caller did. */
async function inMcpFieldNames<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof McpToolInputError) {
      const message = DTO_TO_MCP_FIELD_NAMES.reduce(
        (text, [dtoName, mcpName]) => text.split(dtoName).join(mcpName),
        error.message,
      );
      throw new McpToolInputError(message);
    }
    throw error;
  }
}

interface UserRules {
  rules: CategoryRuleDto[];
  categories: McpCategory[];
}

/**
 * The MCP tools for the user's category rules. Writes go through
 * CategoryRulesService with the web app's own DTOs and validation, exactly as
 * Settings saves them. Every lookup starts from the caller's own rule list, so
 * another user's rule id is simply "not found" and never reaches a write.
 */
@Injectable()
export class McpRuleToolsService {
  constructor(
    private readonly categoryRulesService: CategoryRulesService,
    private readonly contextService: ContextService,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async listRules(context: McpCallContext, args: ToolArgs) {
    const categoryId =
      args.categoryId === undefined
        ? undefined
        : requiredId(args, "categoryId");
    const isEnabled = optionalBoolean(args, "isEnabled");
    const { rules, categories } = await this.loadUserRules(
      context.principal.userId,
    );
    const byId = indexCategories(categories);
    const views = rules
      .filter(
        (rule) =>
          (categoryId === undefined || rule.categoryId === categoryId) &&
          (isEnabled === undefined || rule.isEnabled === isEnabled),
      )
      .map((rule) => toRuleView(rule, byId));
    return { count: views.length, rules: views };
  }

  async getRule(context: McpCallContext, args: ToolArgs) {
    const ruleId = requiredId(args, "ruleId");
    const { rules, categories } = await this.loadUserRules(
      context.principal.userId,
    );
    return {
      rule: toRuleView(findRule(rules, ruleId), indexCategories(categories)),
    };
  }

  async createRule(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const categoryId = requiredId(args, "categoryId");
    const conditions = optionalObject(args, "conditions");
    if (!conditions) {
      throw new McpToolInputError("`conditions` is required");
    }
    const categories = filterCategories(
      await this.contextService.getUserContext(userId),
    );
    const category = findCategory(categories, categoryId);
    const created = await inMcpFieldNames(() => {
      const dto = validateAsDto(CreateCompositeCategoryRuleDto, {
        ...toDtoFields(withoutNulls(conditions)),
        categoryId,
        categoryName: category.name,
      });
      return withServiceRejectionsAsInputErrors(() =>
        this.categoryRulesService.createCompositeRule(userId, dto),
      );
    });
    const view = toRuleView(created, indexCategories(categories));
    await recordSettingsAudit(this.auditLogRepository, context, {
      action: AUDIT_ACTIONS.RULE_CREATED,
      targetType: AUDIT_TARGET_TYPES.RULE,
      targetId: created.id,
      details: { after: view },
    });
    return { created: view };
  }

  async updateRule(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const ruleId = requiredId(args, "ruleId");
    const categoryId =
      args.categoryId === undefined
        ? undefined
        : requiredId(args, "categoryId");
    const isEnabled = optionalBoolean(args, "isEnabled");
    const conditions = optionalObject(args, "conditions");
    if (
      categoryId === undefined &&
      isEnabled === undefined &&
      conditions === undefined
    ) {
      throw new McpToolInputError(
        "Pass at least one of `categoryId`, `isEnabled` or `conditions`",
      );
    }
    const { rules, categories } = await this.loadUserRules(userId);
    const current = findRule(rules, ruleId);
    if (categoryId !== undefined) findCategory(categories, categoryId);
    const updated = await inMcpFieldNames(() => {
      const dto = validateAsDto(PatchCategoryRuleDto, {
        categoryId,
        isEnabled,
        compositeSpec: conditions && this.mergedSpecFor(current, conditions),
      });
      return withServiceRejectionsAsInputErrors(() =>
        this.categoryRulesService.updateCategoryRule(userId, ruleId, dto),
      );
    });
    if (!updated) {
      throw new McpToolInputError(`No rule found with id ${ruleId}`);
    }
    const byId = indexCategories(categories);
    const before = toRuleView(current, byId);
    const after = toRuleView(updated, byId);
    await recordSettingsAudit(this.auditLogRepository, context, {
      action: AUDIT_ACTIONS.RULE_UPDATED,
      targetType: AUDIT_TARGET_TYPES.RULE,
      targetId: ruleId,
      details: { before, after },
    });
    return { before, after };
  }

  async setRulesEnabled(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const ruleIds = requiredIdList(
      args,
      "ruleIds",
      MCP_SETTINGS.MAX_RULE_IDS_PER_CALL,
    );
    const isEnabled = optionalBoolean(args, "isEnabled");
    if (isEnabled === undefined) {
      throw new McpToolInputError("`isEnabled` is required (true or false)");
    }
    const dryRun = optionalBoolean(args, "dryRun") ?? false;
    const { rules } = await this.loadUserRules(userId);
    const { found, notFound } = partitionOwnRules(rules, ruleIds);
    const toChange = found.filter((rule) => rule.isEnabled !== isEnabled);
    const changedIds = toChange.map((rule) => rule.id);
    const outcome = {
      dryRun,
      isEnabled,
      /** Changed, or with dryRun, would change. */
      ruleIdsChanged: changedIds,
      alreadyThatWay: found
        .filter((rule) => rule.isEnabled === isEnabled)
        .map((rule) => rule.id),
      notFound,
    };
    if (dryRun || !toChange.length) return outcome;

    // One at a time: enabling re-files the rule's matching threads, and fifty in parallel would contend.
    for (const rule of toChange) {
      await this.categoryRulesService.updateCategoryRule(userId, rule.id, {
        isEnabled,
      });
    }
    await recordSettingsAudit(this.auditLogRepository, context, {
      action: AUDIT_ACTIONS.RULES_ENABLED_CHANGED,
      targetType: AUDIT_TARGET_TYPES.RULE,
      targetId: null,
      details: { ruleIds: changedIds, isEnabled },
    });
    return outcome;
  }

  async deleteRules(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const ruleIds = requiredIdList(
      args,
      "ruleIds",
      MCP_SETTINGS.MAX_RULE_IDS_PER_CALL,
    );
    const dryRun = optionalBoolean(args, "dryRun") ?? false;
    const { rules, categories } = await this.loadUserRules(userId);
    const { found, notFound } = partitionOwnRules(rules, ruleIds);
    const byId = indexCategories(categories);
    const views = found.map((rule) => toRuleView(rule, byId));
    if (dryRun) {
      return { dryRun: true, wouldDelete: views, notFound };
    }

    for (const rule of found) {
      await this.categoryRulesService.deleteRule(userId, rule.id);
    }
    if (views.length) {
      await recordSettingsAudit(this.auditLogRepository, context, {
        action: AUDIT_ACTIONS.RULES_DELETED,
        targetType: AUDIT_TARGET_TYPES.RULE,
        targetId: null,
        details: { before: views },
      });
    }
    return { dryRun: false, deleted: views, notFound };
  }

  private mergedSpecFor(rule: CategoryRuleDto, changes: ToolArgs): ToolArgs {
    if (!rule.compositeSpec) {
      throw new McpToolInputError(
        "This is a legacy (auto-learned) rule: its conditions can't be edited. Disable or delete it and create a composite rule instead.",
      );
    }
    return toDtoFields(
      mergeConditions(toRuleConditions(rule.compositeSpec), changes),
    );
  }

  private async loadUserRules(userId: string): Promise<UserRules> {
    const [rules, contexts] = await Promise.all([
      this.categoryRulesService.listRules(userId),
      this.contextService.getUserContext(userId),
    ]);
    return { rules, categories: filterCategories(contexts) };
  }
}

function findRule(rules: CategoryRuleDto[], ruleId: string): CategoryRuleDto {
  const rule = rules.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    throw new McpToolInputError(`No rule found with id ${ruleId}`);
  }
  return rule;
}

function partitionOwnRules(rules: CategoryRuleDto[], ruleIds: string[]) {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  return {
    found: ruleIds.flatMap((id) => byId.get(id) ?? []),
    notFound: ruleIds.filter((id) => !byId.has(id)),
  };
}
