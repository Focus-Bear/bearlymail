import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { ContactCustomField } from "../database/entities/contact-custom-field.entity";
import { ContactCustomFieldValue } from "../database/entities/contact-custom-field-value.entity";
import { ContactNote } from "../database/entities/contact-note.entity";
import { ContactType } from "../database/entities/contact-type.entity";
import { QueueModule } from "../queue/queue.module";
import { UsersModule } from "../users/users.module";
import { ContactCrmService } from "./contact-crm.service";
import { ContactSyncProcessor } from "./contact-sync.processor";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { GmailContactsProvider } from "./providers/gmail-contacts.provider";

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
