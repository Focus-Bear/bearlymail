import { Global, Module } from "@nestjs/common";

import { PusherController } from "./pusher.controller";
import { PusherService } from "./pusher.service";

@Global()
@Module({
  controllers: [PusherController],
  providers: [PusherService],
  exports: [PusherService],
})
export class PusherModule {}
