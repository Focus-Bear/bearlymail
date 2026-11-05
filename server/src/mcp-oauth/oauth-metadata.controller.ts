import { Controller, Get } from "@nestjs/common";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "./mcp-oauth-metadata";

const WELL_KNOWN = ".well-known";
const PROTECTED_RESOURCE = "oauth-protected-resource";
const AUTHORIZATION_SERVER = "oauth-authorization-server";

/**
 * Public discovery documents. The protected-resource metadata is served both
 * path-suffixed (what the 401 challenge points at) and at the root, since MCP
 * clients fall back to probing either.
 */
@Controller(WELL_KNOWN)
export class OAuthMetadataController {
  @Get(`${PROTECTED_RESOURCE}/${MCP_SERVER.ROUTE}`)
  mcpProtectedResource() {
    return buildProtectedResourceMetadata();
  }

  @Get(PROTECTED_RESOURCE)
  rootProtectedResource() {
    return buildProtectedResourceMetadata();
  }

  @Get(AUTHORIZATION_SERVER)
  authorizationServer() {
    return buildAuthorizationServerMetadata();
  }
}
