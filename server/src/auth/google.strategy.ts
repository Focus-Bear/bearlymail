import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_REDIRECT_URI'),
      scope: [
        'email', 
        'profile',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly'
      ],
      // These need to be in authorizationParams, not here
    });
    
    // Override authorizationParams to ensure refresh token is requested
    // This is the correct way to pass access_type and prompt to Google's OAuth endpoint
    (this as any).authorizationParams = (options: any) => {
      return {
        access_type: 'offline',
        prompt: 'consent',
      };
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      console.log(`[GoogleStrategy] OAuth callback received:`);
      console.log(`  - accessToken: ${accessToken ? '[PRESENT]' : 'NULL'}`);
      console.log(`  - refreshToken: ${refreshToken ? '[PRESENT]' : 'NULL'}`);
      console.log(`  - profile.id: ${profile.id}`);
      console.log(`  - profile.email: ${profile.emails?.[0]?.value || 'N/A'}`);
      const { writeDebugLog } = require('./auth-logger');
      writeDebugLog(`[GoogleStrategy] OAuth callback - accessToken: ${accessToken ? 'PRESENT' : 'NULL'}, refreshToken: ${refreshToken ? 'PRESENT' : 'NULL'}`);
      
      const user = await this.authService.validateGoogleUser(
        profile,
        accessToken,
        refreshToken,
      );
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}

