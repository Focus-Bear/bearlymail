import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MCPOAuthService } from "./mcp-oauth.service";
import { MCPServersService } from "./mcp-servers.service";

interface AuthenticatedRequest {
  user: { userId: string; email: string };
}

const FRONTEND_URL = (): string =>
  process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * OAuth endpoints for MCP connections. Kept on a controller without a
 * class-level JWT guard so the provider redirect (`/oauth/callback`) can be
 * reached unauthenticated — it is correlated to a user via the signed `state`.
 *
 * Issue: MCP-native OAuth connect flow (Google Drive first).
 */
@Controller("mcp-servers")
export class MCPOAuthController {
  constructor(
    private readonly oauthService: MCPOAuthService,
    private readonly mcpServersService: MCPServersService,
  ) {}

  /** Begin authorization for a connection; returns the URL to send the browser to. */
  @UseGuards(JwtAuthGuard)
  @Get(":id/oauth/start")
  async start(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<{ authorizationUrl: string }> {
    const config = await this.mcpServersService.findOne(req.user.userId, id);
    const authorizationUrl = await this.oauthService.beginAuthorization(config);
    return { authorizationUrl };
  }

  /** Provider redirect target. Exchanges the code, then bounces back to settings. */
  @Get("oauth/callback")
  async callback(
    @Query("state") state: string,
    @Query("code") code: string,
    @Query("error") error: string,
    @Res() res: Response,
  ): Promise<void> {
    const settingsUrl = (status: "success" | "error"): string =>
      `${FRONTEND_URL()}/settings?mcpConnected=${status}#connected-apps`;
    if (error || !state || !code) {
      res.redirect(settingsUrl("error"));
      return;
    }
    try {
      const config = await this.oauthService.completeAuthorization(state, code);
      await this.mcpServersService.onOAuthConnected(config.id, config.userId);
      res.redirect(settingsUrl("success"));
    } catch {
      res.redirect(settingsUrl("error"));
    }
  }
}
