import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SnoozeController } from "./snooze.controller";
import { SnoozeService } from "./snooze.service";
import { Email } from "../database/entities/email.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Email])],
  controllers: [SnoozeController],
  providers: [SnoozeService],
  exports: [SnoozeService],
})
export class SnoozeModule {}
