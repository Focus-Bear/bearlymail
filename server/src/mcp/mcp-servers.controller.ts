import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MCPSenderContextService } from "./mcp-sender-context.service";
import {
  CreateMCPServerDto,
  MCPServersService,
  UpdateMCPServerDto,
} from "./mcp-servers.service";

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

/** Truthy value the client must send to force-refresh the sender-context cache. */
const REFRESH_TRUE_QUERY_VALUE = "true";

/**
 * REST API for managing MCP server configurations.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Controller("mcp-servers")
@UseGuards(JwtAuthGuard)
export class MCPServersController {
  constructor(
    private readonly mcpServersService: MCPServersService,
    private readonly senderContextService: MCPSenderContextService,
  ) {}

  @Get()
  async list(@Request() req: AuthenticatedRequest) {
    return this.mcpServersService.findAll(req.user.userId);
  }

  /**
   * Fetch context about an email sender from the user's sender-context MCP
   * servers. Declared before the `:id` route so the literal path isn't
   * captured by the param route.
   */
  @Get("sender-context")
  async senderContext(
    @Request() req: AuthenticatedRequest,
    @Query("email") email: string,
    @Query("refresh") refresh?: string,
  ) {
    return this.senderContextService.getSenderContext(
      req.user.userId,
      email,
      refresh === REFRESH_TRUE_QUERY_VALUE,
    );
  }

  @Post()
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateMCPServerDto,
  ) {
    return this.mcpServersService.create(req.user.userId, body);
  }

  @Get(":id")
  async getOne(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.mcpServersService.findOne(req.user.userId, id);
  }

  @Put(":id")
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: UpdateMCPServerDto,
  ) {
    return this.mcpServersService.update(req.user.userId, id, body);
  }

  @Delete(":id")
  async remove(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.mcpServersService.remove(req.user.userId, id);
    return { deleted: true };
  }

  /** Re-fetch and cache the tool list from the server */
  @Post(":id/refresh")
  async refresh(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.mcpServersService.refreshTools(req.user.userId, id);
  }

  /** Return cached tool list */
  @Get(":id/tools")
  async tools(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.mcpServersService.getTools(req.user.userId, id);
  }

  /** Test connectivity to the MCP server */
  @Post(":id/test")
  async test(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.mcpServersService.testConnection(req.user.userId, id);
  }
}
