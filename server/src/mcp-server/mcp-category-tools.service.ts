import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CategoryRulesService } from "../category-rules/category-rules.service";
import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { MCP_SETTINGS } from "../constants/mcp-server.constants";
import { ContextService } from "../context/context.service";
import { AuditLog } from "../database/entities/audit-log.entity";
import { ContextKey, Source } from "../database/entities/user-context.entity";
import { normalizeCategoryNameForDedup } from "../utils/category-format.util";
import { McpCallContext } from "./mcp-server.types";
import {
  filterCategories,
  findCategory,
  indexCategories,
  McpCategory,
  recordSettingsAudit,
  toCategory,
  toCategoryValue,
  toCategoryView,
  toRuleView,
} from "./mcp-settings-views";
import {
  McpToolInputError,
  optionalBoolean,
  optionalNullableString,
  requiredId,
  requiredString,
  ToolArgs,
} from "./mcp-tool-args";

const { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } = MCP_SETTINGS;

function assertValidCategoryName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.includes(MCP_SETTINGS.CATEGORY_VALUE_SEPARATOR)) {
    throw new McpToolInputError(
      `\`name\` can't contain "${MCP_SETTINGS.CATEGORY_VALUE_SEPARATOR}" (it separates a category's name from its description); put the extra detail in \`description\``,
    );
  }
  return trimmed;
}

function assertNameIsFree(
  name: string,
  categories: McpCategory[],
  exceptCategoryId?: string,
): void {
  const key = normalizeCategoryNameForDedup(name);
  const clash = categories.find(
    (category) =>
      category.categoryId !== exceptCategoryId &&
      key !== "" &&
      normalizeCategoryNameForDedup(category.name) === key,
  );
  if (clash) {
    throw new McpToolInputError(
      `A category named "${clash.name}" already exists (categoryId ${clash.categoryId}). Update or reuse it instead of creating a duplicate.`,
    );
  }
}

/**
 * The MCP tools for the user's email categories. They go through the same
 * ContextService calls as Settings → Guide AI → Email categories, scoped to
 * the token's user; only EMAIL_CATEGORY rows are ever read or changed.
 */
@Injectable()
export class McpCategoryToolsService {
  constructor(
    private readonly contextService: ContextService,
    private readonly categoryRulesService: CategoryRulesService,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async listCategories(context: McpCallContext) {
    const { userId } = context.principal;
    const [categories, rules] = await Promise.all([
      this.loadCategories(userId),
      this.categoryRulesService.listRules(userId),
    ]);
    return {
      count: categories.length,
      categories: categories.map((category) => toCategoryView(category, rules)),
    };
  }

  async getCategory(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const categoryId = requiredId(args, "categoryId");
    const [categories, rules] = await Promise.all([
      this.loadCategories(userId),
      this.categoryRulesService.listRules(userId),
    ]);
    const category = findCategory(categories, categoryId);
    const byId = indexCategories(categories);
    return {
      category: toCategoryView(category, rules),
      rules: rules
        .filter((rule) => rule.categoryId === categoryId)
        .map((rule) => toRuleView(rule, byId)),
    };
  }

  async createCategory(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const name = assertValidCategoryName(
      requiredString(
        args,
        "name",
        CATEGORY_RULE_COMPOSITE.MAX_CATEGORY_NAME_LENGTH,
      ),
    );
    const description = optionalNullableString(
      args,
      "description",
      MCP_SETTINGS.MAX_CATEGORY_DESCRIPTION_LENGTH,
    );
    assertNameIsFree(name, await this.loadCategories(userId));

    const created = toCategory(
      await this.contextService.createOrUpdateContext(
        userId,
        ContextKey.EMAIL_CATEGORY,
        toCategoryValue(name, description),
        Source.USER_EDITED,
      ),
    );
    await recordSettingsAudit(this.auditLogRepository, context, {
      action: AUDIT_ACTIONS.CATEGORY_CREATED,
      targetType: AUDIT_TARGET_TYPES.CATEGORY,
      targetId: created.categoryId,
      details: { after: created },
    });
    return { created };
  }

  async updateCategory(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const categoryId = requiredId(args, "categoryId");
    const rawName = optionalNullableString(
      args,
      "name",
      CATEGORY_RULE_COMPOSITE.MAX_CATEGORY_NAME_LENGTH,
    );
    const description = optionalNullableString(
      args,
      "description",
      MCP_SETTINGS.MAX_CATEGORY_DESCRIPTION_LENGTH,
    );
    if (rawName === undefined && description === undefined) {
      throw new McpToolInputError("Pass `name` and/or `description` to change");
    }
    if (rawName !== undefined && !rawName?.trim()) {
      throw new McpToolInputError("`name` can't be empty");
    }
    const categories = await this.loadCategories(userId);
    const before = findCategory(categories, categoryId);
    const name = rawName ? assertValidCategoryName(rawName) : before.name;
    assertNameIsFree(name, categories, categoryId);

    const updated = await this.contextService.updateContext(
      categoryId,
      userId,
      {
        contextValue: toCategoryValue(
          name,
          description === undefined ? before.description : description,
        ),
      },
    );
    if (!updated) {
      throw new McpToolInputError(`No category found with id ${categoryId}`);
    }
    const after = toCategory(updated);
    await recordSettingsAudit(this.auditLogRepository, context, {
      action: AUDIT_ACTIONS.CATEGORY_UPDATED,
      targetType: AUDIT_TARGET_TYPES.CATEGORY,
      targetId: categoryId,
      details: { before, after },
    });
    return { before, after };
  }

  async deleteCategory(context: McpCallContext, args: ToolArgs) {
    const { userId } = context.principal;
    const categoryId = requiredId(args, "categoryId");
    const dryRun = optionalBoolean(args, "dryRun") ?? false;
    const [categories, rules] = await Promise.all([
      this.loadCategories(userId),
      this.categoryRulesService.listRules(userId),
    ]);
    const category = findCategory(categories, categoryId);
    const byId = indexCategories(categories);
    const orphanedRules = rules
      .filter((rule) => rule.categoryId === categoryId)
      .map((rule) => toRuleView(rule, byId));
    const effect = {
      category,
      rulesLeftWithoutACategory: orphanedRules,
      note: orphanedRules.length
        ? "These rules stop matching once the category is gone. Move them to another category with update_rule, or remove them with delete_rules."
        : "No rules point at this category.",
    };
    if (dryRun) {
      return { dryRun: true, wouldDelete: effect };
    }

    await this.contextService.deleteContext(categoryId, userId);
    await recordSettingsAudit(this.auditLogRepository, context, {
      action: AUDIT_ACTIONS.CATEGORY_DELETED,
      targetType: AUDIT_TARGET_TYPES.CATEGORY,
      targetId: categoryId,
      details: {
        before: category,
        ruleIds: orphanedRules.map((rule) => rule.ruleId),
      },
    });
    return { dryRun: false, deleted: effect };
  }

  private async loadCategories(userId: string): Promise<McpCategory[]> {
    return filterCategories(await this.contextService.getUserContext(userId));
  }
}
