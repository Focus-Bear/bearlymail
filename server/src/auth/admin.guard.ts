import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    
    if (!userId) return false;
    
    const user = await this.usersService.findOne(userId);
    return user?.isAdmin === true;
  }
}





