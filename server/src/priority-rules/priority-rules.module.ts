import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AwsModule } from "../aws/aws.module";
import { Email } from "../database/entities/email.entity";
import { PriorityRule } from "../database/entities/priority-rule.entity";
import { PriorityRulesController } from "./priority-rules.controller";
import { PriorityRulesService } from "./priority-rules.service";

@Module({
  imports: [TypeOrmModule.forFeature([PriorityRule, Email]), AwsModule],
  controllers: [PriorityRulesController],
  providers: [PriorityRulesService],
  exports: [PriorityRulesService],
})
export class PriorityRulesModule {}
