import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { PersonalAccessTokenGuard } from "./personal-access-token.guard";
import { PersonalAccessTokensController } from "./personal-access-tokens.controller";
import { PersonalAccessTokensService } from "./personal-access-tokens.service";

@Module({
  imports: [TypeOrmModule.forFeature([PersonalAccessToken]), AuthModule],
  controllers: [PersonalAccessTokensController],
  providers: [PersonalAccessTokensService, PersonalAccessTokenGuard],
  exports: [PersonalAccessTokensService, PersonalAccessTokenGuard],
})
export class PersonalAccessTokensModule {}
