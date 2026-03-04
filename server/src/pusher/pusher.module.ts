import { Global, Module } from "@nestjs/common";

import { PusherService } from "./pusher.service";

@Global()
@Module({
  providers: [PusherService],
  exports: [PusherService],
})
export class PusherModule {}
