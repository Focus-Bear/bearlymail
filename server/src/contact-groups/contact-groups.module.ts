import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ContactsModule } from "../contacts/contacts.module";
import { Contact } from "../database/entities/contact.entity";
import { ContactGroup } from "../database/entities/contact-group.entity";
import { ContactGroupMember } from "../database/entities/contact-group-member.entity";
import { ContactGroupsController } from "./contact-groups.controller";
import { ContactGroupsService } from "./contact-groups.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ContactGroup, ContactGroupMember, Contact]),
    ContactsModule,
  ],
  controllers: [ContactGroupsController],
  providers: [ContactGroupsService],
  exports: [ContactGroupsService],
})
export class ContactGroupsModule {}
