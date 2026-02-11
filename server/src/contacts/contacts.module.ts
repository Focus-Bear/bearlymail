import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contact } from "../database/entities/contact.entity";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { ContactSyncProcessor } from "./contact-sync.processor";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact]),
    forwardRef(() => UsersModule),
    QueueModule,
  ],
  controllers: [ContactsController],
  providers: [ContactsService, GmailContactsProvider, ContactSyncProcessor],
  exports: [ContactsService, GmailContactsProvider],
})
export class ContactsModule {}
