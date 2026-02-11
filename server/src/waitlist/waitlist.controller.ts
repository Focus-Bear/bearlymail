import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { WaitlistService } from "./waitlist.service";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateWaitlistDto } from "./create-waitlist.dto";

@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  async submit(@Body() body: CreateWaitlistDto) {
    return this.waitlistService.create(
      body.email,
      body.firstName,
      body.reason,
      body.emailSystem,
      body.emailSystemOther,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getAll(@Request() _req) {
    return this.waitlistService.findAll();
  }

  @Put(":id/approve")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async approve(@Param("id") id: string) {
    return this.waitlistService.approve(id);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async decline(@Param("id") id: string) {
    return this.waitlistService.decline(id);
  }
}
