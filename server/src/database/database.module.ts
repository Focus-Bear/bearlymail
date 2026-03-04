import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DatabaseCleanupService } from "./database-cleanup.service";
import { Email } from "./entities/email.entity";
import { EmailThread } from "./entities/email-thread.entity";
import { GoogleAccount } from "./entities/google-account.entity";
import { Office365Account } from "./entities/office365-account.entity";
import { PrivateNote } from "./entities/private-note.entity";
import { ScanEmail } from "./entities/scan-email.entity";
import { User } from "./entities/user.entity";
import { UserContext } from "./entities/user-context.entity";
import { ZohoAccount } from "./entities/zoho-account.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserContext,
      PrivateNote,
      Email,
      EmailThread,
      ScanEmail,
      GoogleAccount,
      Office365Account,
      ZohoAccount,
    ]),
  ],
  providers: [DatabaseCleanupService],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
