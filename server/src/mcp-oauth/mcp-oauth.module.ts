import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { OAuthAuthorizationCode } from "../database/entities/oauth-authorization-code.entity";
import { OAuthClient } from "../database/entities/oauth-client.entity";
import { PersonalAccessTokensModule } from "../personal-access-tokens/personal-access-tokens.module";
import { OAuthController } from "./oauth.controller";
import { OAuthAuthorizationService } from "./oauth-authorization.service";
import { OAuthClientRegistryService } from "./oauth-client-registry.service";
import { OAuthConsentController } from "./oauth-consent.controller";
import { OAuthMetadataController } from "./oauth-metadata.controller";
import { OAuthTokenEndpointService } from "./oauth-token-endpoint.service";

/**
 * OAuth 2.1 authorization server for BearlyMail's MCP endpoint, so claude.ai
 * (web and mobile) can be added as a custom connector by pasting the `/mcp`
 * URL. Issues tokens that resolve to the same principal as personal access
 * tokens, so the MCP tools and their scope checks are unchanged.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthClient, OAuthAuthorizationCode]),
    PersonalAccessTokensModule,
  ],
  controllers: [
    OAuthMetadataController,
    OAuthController,
    OAuthConsentController,
  ],
  providers: [
    OAuthClientRegistryService,
    OAuthAuthorizationService,
    OAuthTokenEndpointService,
  ],
})
export class McpOAuthModule {}
