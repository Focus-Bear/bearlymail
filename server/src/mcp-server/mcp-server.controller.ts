import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Response } from "express";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import {
  PatAuthenticatedRequest,
  PersonalAccessTokenGuard,
} from "../personal-access-tokens/personal-access-token.guard";
import { McpRateLimitGuard } from "./mcp-rate-limit.guard";
import { JsonRpcResponse } from "./mcp-server.types";
import { McpServerProtocolService } from "./mcp-server-protocol.service";

const ALLOWED_METHODS = "POST";

/**
 * BearlyMail's MCP endpoint (Streamable HTTP transport, stateless). Clients
 * such as Claude Code and Claude Desktop connect with a personal access token
 * created in Settings: `Authorization: Bearer bm_pat_...`.
 */
@Controller(MCP_SERVER.ROUTE)
@UseGuards(PersonalAccessTokenGuard, McpRateLimitGuard)
@SkipThrottle({ default: true, feedback: true, polling: true })
export class McpServerController {
  constructor(private readonly protocolService: McpServerProtocolService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Request() req: PatAuthenticatedRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
    const userAgent = req.headers["user-agent"];
    const response = await this.protocolService.handle(
      {
        principal: req.user,
        ipAddress: req.ip ?? null,
        userAgent: typeof userAgent === "string" ? userAgent : null,
      },
      body,
    );
    if (response === null) {
      res.status(HttpStatus.ACCEPTED);
      return undefined;
    }
    return response;
  }

  /** No server-initiated message stream on a stateless server. */
  @Get()
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectStream(@Res({ passthrough: true }) res: Response): void {
    res.setHeader("Allow", ALLOWED_METHODS);
  }

  /** No session to end: Nest maps one HTTP method per handler, hence two. */
  @Delete()
  @HttpCode(HttpStatus.METHOD_NOT_ALLOWED)
  rejectSessionEnd(@Res({ passthrough: true }) res: Response): void {
    res.setHeader("Allow", ALLOWED_METHODS);
  }
}
