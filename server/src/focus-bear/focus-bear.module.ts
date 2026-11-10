import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module";
import { FocusBearController } from "./focus-bear.controller";
import { FocusBearService } from "./focus-bear.service";
import { FocusBearApiService } from "./focus-bear-api.service";

@Module({
  imports: [UsersModule],
  controllers: [FocusBearController],
  providers: [FocusBearService, FocusBearApiService],
})
export class FocusBearModule {}
