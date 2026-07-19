import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AppleMailAccount } from "../database/entities/apple-mail-account.entity";
import { AppleMailMessageRef } from "../database/entities/apple-mail-message-ref.entity";
import { UsersModule } from "../users/users.module";
import { AppleMailAccountsController } from "./apple-mail-accounts.controller";
import { AppleMailAccountsService } from "./apple-mail-accounts.service";
import { AppleMailMessageRefService } from "./apple-mail-message-ref.service";
import { AppleMailScriptService } from "./apple-mail-script.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([AppleMailAccount, AppleMailMessageRef]),
    UsersModule,
    forwardRef(() => AuthModule),
  ],
  providers: [
    AppleMailAccountsService,
    AppleMailScriptService,
    AppleMailMessageRefService,
  ],
  controllers: [AppleMailAccountsController],
  exports: [
    AppleMailAccountsService,
    AppleMailScriptService,
    AppleMailMessageRefService,
  ],
})
export class AppleMailAccountsModule {}
