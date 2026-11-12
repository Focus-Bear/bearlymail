import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { ImapAccount } from "../database/entities/imap-account.entity";
import { ImapAccountsController } from "./imap-accounts.controller";
import { ImapAccountsService } from "./imap-accounts.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ImapAccount]),
    forwardRef(() => AuthModule),
  ],
  providers: [ImapAccountsService],
  controllers: [ImapAccountsController],
  exports: [ImapAccountsService],
})
export class ImapAccountsModule {}
