import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import PgBoss = require('pg-boss');
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async validateGoogleUser(profile: any, accessToken: string, refreshToken: string): Promise<any> {
    const email = profile.emails[0].value;
    let user = await this.usersService.findByEmail(email);

    if (!user) {
      // Create new user
      user = await this.usersService.create({
        email,
        name: profile.displayName,
        password: '', // No password for Google users
        googleId: profile.id,
        googleCalendarAccessToken: accessToken,
        googleCalendarRefreshToken: refreshToken,
      });
    } else {
      // Update tokens for existing user
      await this.usersService.update(user.id, {
        googleId: profile.id,
        googleCalendarAccessToken: accessToken,
        googleCalendarRefreshToken: refreshToken,
      });
      user = await this.usersService.findOne(user.id);
    }

    const { password, ...result } = user;
    
    // Trigger email sync asynchronously via queue
    this.boss.send('sync-gmail', { userId: user.id }).catch(err => console.error('Failed to add sync job', err));
    
    return result;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async register(email: string, password: string, name?: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      name,
    });
    return this.login(user);
  }
}

