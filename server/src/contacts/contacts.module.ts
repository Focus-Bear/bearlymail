import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../database/entities/contact.entity';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { GmailContactsProvider } from './providers/gmail-contacts.provider';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact]),
    forwardRef(() => UsersModule),
  ],
  controllers: [ContactsController],
  providers: [ContactsService, GmailContactsProvider],
  exports: [ContactsService, GmailContactsProvider],
})
export class ContactsModule {}



