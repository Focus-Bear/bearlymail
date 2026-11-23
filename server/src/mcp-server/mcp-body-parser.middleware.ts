import { json, NextFunction, Request, RequestHandler, Response } from "express";

import { MCP_SERVER } from "../constants/mcp-server.constants";

const parseMcpJson: RequestHandler = json({
  limit: MCP_SERVER.MAX_REQUEST_BODY,
});

/**
 * JSON parser for `POST /mcp` with a larger limit than the app-wide 100kb one,
 * because create_draft/update_draft carry attachments as base64. It must be
 * mounted before Nest registers its own parser (which skips an already-parsed
 * body); a route middleware in the module would run after that parser had
 * already refused the request.
 *
 * It is a named wrapper, not express's `json()` itself: Nest skips its global
 * JSON parser when any middleware named `jsonParser` is already registered, so
 * mounting `json()` directly, even on one path, would leave every other route
 * with an unparsed body.
 */
export function mcpJsonBodyParser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  parseMcpJson(req, res, next);
}
