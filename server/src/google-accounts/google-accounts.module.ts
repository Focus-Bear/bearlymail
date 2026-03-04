import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { GoogleAccount } from "../database/entities/google-account.entity";
import { UsersModule } from "../users/users.module";
import { GoogleAccountsController } from "./google-accounts.controller";
import { GoogleAccountsService } from "./google-accounts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([GoogleAccount]),
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  providers: [GoogleAccountsService],
  controllers: [GoogleAccountsController],
  exports: [GoogleAccountsService],
})
export class GoogleAccountsModule {}
