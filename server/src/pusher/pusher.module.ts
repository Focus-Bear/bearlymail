import { Module, Global } from "@nestjs/common";
import { PusherService } from "./pusher.service";

@Global()
@Module({
  providers: [PusherService],
  exports: [PusherService],
})
export class PusherModule {}
