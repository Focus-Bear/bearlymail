import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CreateWorkflowRuleDto,
  ReorderWorkflowRulesDto,
  UpdateWorkflowRuleDto,
  WorkflowPreviewDto,
} from "./types/workflow.types";
import { WorkflowExecutionService } from "./workflow-execution.service";
import { WorkflowsService } from "./workflows.service";

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

const DEFAULT_LIMIT = 50;

/**
 * REST API for workflow rule management and execution history.
 *
 * Part of feature #1483 — Automated Email Workflows.
 *
 * IMPORTANT: static path segments must be declared BEFORE parametric routes.
 * "executions/all" and "reorder" must come before ":id" to avoid Express
 * interpreting "executions" and "reorder" as :id values.
 */
@Controller("workflows")
@UseGuards(JwtAuthGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly executionService: WorkflowExecutionService,
  ) {}

  // ── Static sub-paths (must precede :id routes) ────────────────────────────────

  @Get("executions/all")
  async allExecutions(
    @Request() req: AuthenticatedRequest,
    @Query("limit") limit?: string,
  ) {
    const parsed = parseInt(limit ?? "", 10);
    const lim = Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT;
    return this.workflowsService.getAllExecutions(req.user.userId, lim);
  }

  @Put("reorder")
  async reorder(
    @Request() req: AuthenticatedRequest,
    @Body() body: ReorderWorkflowRulesDto,
  ) {
    await this.workflowsService.reorder(req.user.userId, body);
    return { reordered: true };
  }

  @Post("preview")
  async preview(
    @Request() _req: AuthenticatedRequest,
    @Body() _body: WorkflowPreviewDto,
  ) {
    // Preview is a read-only dry-run: returns condition match results only
    // Full variable resolution requires an email threadId to be loaded from DB.
    // This endpoint is intentionally lightweight for the MVP.
    return { message: "Preview endpoint available. Full dry-run in v2." };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  @Get()
  async list(@Request() req: AuthenticatedRequest) {
    return this.workflowsService.findAll(req.user.userId);
  }

  @Post()
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateWorkflowRuleDto,
  ) {
    return this.workflowsService.create(req.user.userId, body);
  }

  @Get(":id")
  async getOne(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.workflowsService.findOne(req.user.userId, id);
  }

  @Put(":id")
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: UpdateWorkflowRuleDto,
  ) {
    return this.workflowsService.update(req.user.userId, id, body);
  }

  @Delete(":id")
  async remove(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.workflowsService.remove(req.user.userId, id);
    return { deleted: true };
  }

  @Patch(":id/toggle")
  async toggle(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.workflowsService.toggle(req.user.userId, id);
  }

  // ── Execution history (parametric — comes after static routes) ────────────────

  @Get(":id/executions")
  async executionHistory(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("limit") limit?: string,
  ) {
    const parsed = parseInt(limit ?? "", 10);
    const lim = Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT;
    return this.workflowsService.getExecutionHistory(req.user.userId, id, lim);
  }
}
