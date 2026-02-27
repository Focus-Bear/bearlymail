import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Contact } from "../database/entities/contact.entity";
import { ContactNote } from "../database/entities/contact-note.entity";
import { ContactCustomField } from "../database/entities/contact-custom-field.entity";
import { ContactCustomFieldValue } from "../database/entities/contact-custom-field-value.entity";
import { ContactType } from "../database/entities/contact-type.entity";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { ContactCrmService } from "./contact-crm.service";
import { ContactSyncProcessor } from "./contact-sync.processor";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";
import { UsersModule } from "../users/users.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contact,
      ContactNote,
      ContactCustomField,
      ContactCustomFieldValue,
      ContactType,
    ]),
    forwardRef(() => UsersModule),
    QueueModule,
  ],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactCrmService,
    GmailContactsProvider,
    ContactSyncProcessor,
  ],
  exports: [ContactsService, ContactCrmService, GmailContactsProvider],
})
export class ContactsModule {}
