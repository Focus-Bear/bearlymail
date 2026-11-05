import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";

import { HTTP_HEADERS } from "../constants/http-headers";
import { MCP_OAUTH, OAUTH_ERROR_CODES } from "../constants/mcp-oauth.constants";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthClientRegistryService } from "./oauth-client-registry.service";
import { OAuthError } from "./oauth-error";
import { OAuthTokenEndpointService } from "./oauth-token-endpoint.service";

const OAUTH_ROUTE = "oauth";
const NO_STORE = "no-store";
const NO_CACHE = "no-cache";
const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;

/** Maps anything thrown while serving an OAuth endpoint to an RFC 6749 error. */
function toOAuthError(error: unknown): OAuthError {
  if (error instanceof OAuthError) return error;
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status >= CLIENT_ERROR_MIN && status < SERVER_ERROR_MIN) {
      return new OAuthError(OAUTH_ERROR_CODES.INVALID_REQUEST, error.message);
    }
  }
  return new OAuthError(
    OAUTH_ERROR_CODES.SERVER_ERROR,
    "Unexpected error",
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

/**
 * The OAuth 2.1 endpoints that MCP clients call directly. Parameters arrive as
 * plain records (query string or form body) rather than DTOs: OAuth clients
 * send extras the global whitelist pipe would reject, and errors must be
 * RFC 6749 JSON, so each handler writes its own response.
 */
@Controller(OAUTH_ROUTE)
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly authorizationService: OAuthAuthorizationService,
    private readonly tokenEndpointService: OAuthTokenEndpointService,
    private readonly clientRegistry: OAuthClientRegistryService,
  ) {}

  /** Sends the browser to the consent page, or back to the client with an error. */
  @Get("authorize")
  async authorize(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      res.redirect(
        HttpStatus.FOUND,
        await this.authorizationService.beginAuthorization(query),
      );
    } catch (error: unknown) {
      // The client or redirect URI isn't trusted, so the error is shown here
      // rather than sent anywhere (OAuth 2.1 §4.1.2.1).
      this.sendError(res, error);
    }
  }

  @Post("token")
  async token(
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const tokens = await this.tokenEndpointService.exchange(body ?? {});
      this.setNoStore(res);
      res.status(HttpStatus.OK).json(tokens);
    } catch (error: unknown) {
      this.sendError(res, error);
    }
  }

  @Post("register")
  @Throttle({
    default: {
      limit: MCP_OAUTH.REGISTER_RATE_LIMIT,
      ttl: MCP_OAUTH.RATE_WINDOW_MS,
    },
  })
  async register(
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const client = await this.clientRegistry.register(body);
      this.setNoStore(res);
      res.status(HttpStatus.CREATED).json(client);
    } catch (error: unknown) {
      this.sendError(res, error);
    }
  }

  @Post("revoke")
  async revoke(
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.tokenEndpointService.revoke(body ?? {});
      res.status(HttpStatus.OK).end();
    } catch (error: unknown) {
      this.sendError(res, error);
    }
  }

  private setNoStore(res: Response): void {
    res.setHeader(HTTP_HEADERS.CACHE_CONTROL, NO_STORE);
    res.setHeader(HTTP_HEADERS.PRAGMA, NO_CACHE);
  }

  private sendError(res: Response, error: unknown): void {
    const oauthError = toOAuthError(error);
    if (oauthError.status >= SERVER_ERROR_MIN) {
      this.logger.error(
        `OAuth endpoint failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.setNoStore(res);
    res.status(oauthError.status).json(oauthError.toJSON());
  }
}
