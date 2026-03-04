import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BlockedSender } from "../database/entities/blocked-sender.entity";
import { BlockedSendersController } from "./blocked-senders.controller";
import { BlockedSendersService } from "./blocked-senders.service";

@Module({
  imports: [TypeOrmModule.forFeature([BlockedSender])],
  controllers: [BlockedSendersController],
  providers: [BlockedSendersService],
  exports: [BlockedSendersService],
})
export class BlockedSendersModule {}
