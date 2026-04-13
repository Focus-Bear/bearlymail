import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Contact } from "../database/entities/contact.entity";
import { ContactCustomField } from "../database/entities/contact-custom-field.entity";
import { ContactCustomFieldValue } from "../database/entities/contact-custom-field-value.entity";
import { ContactNote } from "../database/entities/contact-note.entity";
import { ContactType } from "../database/entities/contact-type.entity";
import { Email } from "../database/entities/email.entity";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { QueueModule } from "../queue/queue.module";
import { UsersModule } from "../users/users.module";
import { ContactCrmService } from "./contact-crm.service";
import { ContactSyncProcessor } from "./contact-sync.processor";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import {
  GmailContactsProvider,
  setGoogleAccountsServiceGetter,
} from "./providers/gmail-contacts.provider";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contact,
      ContactNote,
      ContactCustomField,
      ContactCustomFieldValue,
      ContactType,
      Email,
    ]),
    forwardRef(() => UsersModule),
    GoogleAccountsModule,
    QueueModule,
  ],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactCrmService,
    GmailContactsProvider,
    ContactSyncProcessor,
    {
      provide: "GMAIL_GAS_INIT",
      inject: [GoogleAccountsService],
      useFactory: (gas: GoogleAccountsService) => {
        setGoogleAccountsServiceGetter(() => gas);
      },
    },
  ],
  exports: [ContactsService, ContactCrmService, GmailContactsProvider],
})
export class ContactsModule {}
