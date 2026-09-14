import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import type Pusher from "pusher";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthorizeChannelDto } from "./dto/authorize-channel.dto";
import { PusherService } from "./pusher.service";

@Controller("pusher")
@UseGuards(JwtAuthGuard)
export class PusherController {
  constructor(private readonly pusherService: PusherService) {}

  /**
   * Pusher calls this from the browser before it will subscribe the client to a
   * `private-` channel. The guard establishes who is asking; the service decides
   * whether the requested channel is theirs.
   */
  @Post("auth")
  authorizeChannel(
    @Request() req,
    @Body() dto: AuthorizeChannelDto,
  ): Pusher.ChannelAuthResponse {
    return this.pusherService.authorizeUserChannel(
      req.user.userId,
      dto.socket_id,
      dto.channel_name,
    );
  }
}
