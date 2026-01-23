import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnoozeController } from "./snooze.controller";
import { SnoozeService } from "./snooze.service";
import { Email } from "../database/entities/email.entity";
import { EmailsModule } from "../emails/emails.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Email]),
    forwardRef(() => EmailsModule),
  ],
  controllers: [SnoozeController],
  providers: [SnoozeService],
  exports: [SnoozeService],
})
export class SnoozeModule {}
