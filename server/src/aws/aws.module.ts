import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CloudWatchService } from "./cloudwatch.service";

@Module({
  imports: [ConfigModule],
  providers: [CloudWatchService],
  exports: [CloudWatchService],
})
export class AwsModule {}


