import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { OAuthGrantsService } from "./oauth-grants.service";
import { PersonalAccessTokenGuard } from "./personal-access-token.guard";
import { PersonalAccessTokensController } from "./personal-access-tokens.controller";
import { PersonalAccessTokensService } from "./personal-access-tokens.service";

@Module({
  imports: [TypeOrmModule.forFeature([PersonalAccessToken]), AuthModule],
  controllers: [PersonalAccessTokensController],
  providers: [
    PersonalAccessTokensService,
    PersonalAccessTokenGuard,
    OAuthGrantsService,
  ],
  exports: [
    PersonalAccessTokensService,
    PersonalAccessTokenGuard,
    OAuthGrantsService,
  ],
})
export class PersonalAccessTokensModule {}
