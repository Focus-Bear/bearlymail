import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { WorkflowExecutionLog } from "../database/entities/workflow-execution-log.entity";
import { WorkflowRule } from "../database/entities/workflow-rule.entity";
import { matchPattern } from "../summarization/pattern-matcher";
import {
  CreateWorkflowRuleDto,
  ReorderWorkflowRulesDto,
  UpdateWorkflowRuleDto,
  WorkflowCondition,
  WorkflowContext,
} from "./types/workflow.types";

const DEFAULT_PAGE_LIMIT = 50;

/**
 * CRUD and condition-matching service for workflow rules.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    @InjectRepository(WorkflowRule)
    private readonly rulesRepo: Repository<WorkflowRule>,
    @InjectRepository(WorkflowExecutionLog)
    private readonly logsRepo: Repository<WorkflowExecutionLog>,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async findAll(userId: string): Promise<WorkflowRule[]> {
    return this.rulesRepo.find({
      where: { userId },
      order: { priority: "ASC", createdAt: "ASC" },
    });
  }

  async findOne(userId: string, id: string): Promise<WorkflowRule> {
    const rule = await this.rulesRepo.findOne({ where: { id, userId } });
    if (!rule) throw new NotFoundException(`Workflow rule not found: ${id}`);
    return rule;
  }

  async create(
    userId: string,
    dto: CreateWorkflowRuleDto,
  ): Promise<WorkflowRule> {
    const rule = this.rulesRepo.create({
      userId,
      name: dto.name,
      enabled: dto.enabled ?? true,
      priority: dto.priority ?? 0,
      condition: dto.condition,
      actions: dto.actions,
    });
    return this.rulesRepo.save(rule);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateWorkflowRuleDto,
  ): Promise<WorkflowRule> {
    await this.findOne(userId, id);
    await this.rulesRepo.update({ id, userId }, dto);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.rulesRepo.delete({ id, userId });
  }

  async toggle(userId: string, id: string): Promise<WorkflowRule> {
    const rule = await this.findOne(userId, id);
    await this.rulesRepo.update({ id, userId }, { enabled: !rule.enabled });
    return this.findOne(userId, id);
  }

  async reorder(userId: string, dto: ReorderWorkflowRulesDto): Promise<void> {
    // Validate all IDs belong to the user
    const rules = await this.rulesRepo.find({
      where: { id: In(dto.ids), userId },
    });
    if (rules.length !== dto.ids.length) {
      throw new NotFoundException("One or more workflow rules not found");
    }

    // Assign priority = index position
    await Promise.all(
      dto.ids.map((id, index) =>
        this.rulesRepo.update({ id, userId }, { priority: index }),
      ),
    );
  }

  // ── Condition matching ────────────────────────────────────────────────────────

  /**
   * Find the first enabled rule (by priority order) whose deterministic
   * conditions match the given email context.
   *
   * Note: naturalLanguageCondition evaluation is handled in WorkflowExecutionService
   * to keep the LLM call co-located with execution.
   */
  async findMatchingRule(
    userId: string,
    context: WorkflowContext,
  ): Promise<WorkflowRule | null> {
    const rules = await this.findAll(userId);
    const enabled = rules.filter((rule) => rule.enabled);

    for (const rule of enabled) {
      if (this.matchesDeterministic(rule.condition, context)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Find ALL enabled rules that match deterministically (for preview / dry-run).
   */
  async findAllMatchingRules(
    userId: string,
    context: WorkflowContext,
  ): Promise<WorkflowRule[]> {
    const rules = await this.findAll(userId);
    return rules.filter(
      (rule) =>
        rule.enabled && this.matchesDeterministic(rule.condition, context),
    );
  }

  // ── Execution logs ────────────────────────────────────────────────────────────

  async getExecutionHistory(
    userId: string,
    ruleId: string,
    limit = DEFAULT_PAGE_LIMIT,
  ): Promise<WorkflowExecutionLog[]> {
    // Ownership check — throws NotFoundException if the rule doesn't belong to this user
    await this.findOne(userId, ruleId);
    return this.logsRepo.find({
      where: { workflowRuleId: ruleId },
      order: { executedAt: "DESC" },
      take: limit,
    });
  }

  async getAllExecutions(
    userId: string,
    limit = DEFAULT_PAGE_LIMIT,
  ): Promise<WorkflowExecutionLog[]> {
    return this.logsRepo.find({
      where: { userId },
      order: { executedAt: "DESC" },
      take: limit,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private matchesDeterministic(
    condition: WorkflowCondition,
    context: WorkflowContext,
  ): boolean {
    // fromPatterns: empty = any sender
    if (
      condition.fromPatterns.length > 0 &&
      !matchAny(context.from, condition.fromPatterns)
    ) {
      return false;
    }

    // subjectPatterns: empty = any subject
    if (
      condition.subjectPatterns.length > 0 &&
      !matchAny(context.subject, condition.subjectPatterns)
    ) {
      return false;
    }

    // categories: empty/undefined = any
    if (
      condition.categories &&
      condition.categories.length > 0 &&
      !condition.categories.includes(context.category)
    ) {
      return false;
    }

    // priorityLevels: empty/undefined = any
    if (
      condition.priorityLevels &&
      condition.priorityLevels.length > 0 &&
      !condition.priorityLevels.includes(context.priority as never)
    ) {
      return false;
    }

    return true;
  }
}

/** Returns true if value matches any pattern in the list */
function matchAny(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchPattern(value, pattern));
}
