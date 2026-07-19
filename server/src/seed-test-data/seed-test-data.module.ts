import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { SeedTestDataController } from "./seed-test-data.controller";
import { SeedTestDataService } from "./seed-test-data.service";

@Module({
  imports: [TypeOrmModule.forFeature([Email, EmailThread, UserContext])],
  controllers: [SeedTestDataController],
  providers: [SeedTestDataService],
})
export class SeedTestDataModule {}
