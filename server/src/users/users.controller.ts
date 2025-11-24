import { Controller, Get, Put, UseGuards, Request, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@Request() req) {
    const user = await this.usersService.findOne(req.user.userId);
    const { password, ...result } = user;
    return result;
  }

  @Put('me')
  async updateProfile(@Request() req, @Body() updates: any) {
    return this.usersService.update(req.user.userId, updates);
  }
}

