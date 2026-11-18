import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module";
import { FocusBearController } from "./focus-bear.controller";
import { FocusBearService } from "./focus-bear.service";
import { FocusBearApiService } from "./focus-bear-api.service";
import { FocusBearCredentialsService } from "./focus-bear-credentials.service";
import { FocusBearOAuthClient } from "./focus-bear-oauth.client";
import { FocusBearOAuthService } from "./focus-bear-oauth.service";

@Module({
  imports: [UsersModule],
  controllers: [FocusBearController],
  providers: [
    FocusBearService,
    FocusBearApiService,
    FocusBearCredentialsService,
    FocusBearOAuthClient,
    FocusBearOAuthService,
  ],
})
export class FocusBearModule {}
