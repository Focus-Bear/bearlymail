import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { CloudWatchService } from "./cloudwatch.service";
import { SqsService } from "./sqs.service";

@Module({
  imports: [ConfigModule],
  providers: [CloudWatchService, SqsService],
  exports: [CloudWatchService, SqsService],
})
export class AwsModule {}
