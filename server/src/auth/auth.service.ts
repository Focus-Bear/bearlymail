import { Injectable, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import PgBoss = require('pg-boss');
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { writeDebugLog } from './auth-logger';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @Inject('PG_BOSS') private readonly boss: PgBoss,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      // Check if user is approved
      if (!user.isApproved) {
        throw new Error('Your account is pending approval. Please wait for admin approval.');
      }
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async validateGoogleUser(profile: any, accessToken: string, refreshToken: string): Promise<any> {
    const email = profile.emails[0].value;
    const isJeremy = email.toLowerCase() === 'jeremy@focusbear.io';
    
    let user = await this.usersService.findByEmail(email);
    const isNewUser = !user;

    // Check if refresh token is missing - this is critical for email sync
    if (!refreshToken) {
      this.logger.error(`[LOGIN] CRITICAL: Google OAuth did not provide a refresh token for user ${email}`);
      writeDebugLog(`[LOGIN] CRITICAL: Google OAuth did not provide a refresh token for user ${email}`);
      
      // If this is a new user, we can't proceed without a refresh token
      if (isNewUser) {
        throw new Error('Google OAuth did not provide a refresh token. Please try logging in again. If the issue persists, you may need to revoke app access at https://myaccount.google.com/permissions and try again.');
      }
      
      // For existing users, check if they have a refresh token stored
      if (user && !user.googleCalendarRefreshToken) {
        // User has no refresh token stored AND Google didn't provide one
        // This means email sync will fail - set needsRelogin flag
        this.logger.error(`[LOGIN] User ${user.id} has no refresh token and Google didn't provide one. Email sync will fail.`);
        writeDebugLog(`[LOGIN] User ${user.id} has no refresh token and Google didn't provide one. Email sync will fail.`);
        
        // Update user with access token but mark as needing re-login
        const updates: any = {
          googleId: profile.id,
          googleCalendarAccessToken: accessToken,
          needsRelogin: true, // Mark that user needs to re-authenticate to get refresh token
        };
        if (isJeremy) {
          updates.isApproved = true;
          updates.isAdmin = true;
        }
        await this.usersService.update(user.id, updates);
        user = await this.usersService.findOne(user.id);
        
        // Log this as an auth failure so it shows up in auth-failures.log
        const { authLogger } = require('./auth-logger');
        authLogger.logAuthFailure(
          user.id,
          user.email || null,
          'LOGIN_MISSING_REFRESH_TOKEN',
          new Error('Google OAuth did not provide refresh token'),
          {
            hasAccessToken: true,
            hasRefreshToken: false,
            action: 'User logged in but Google did not provide refresh token. Email sync will not work until user re-authenticates.',
          }
        );
        
        // Don't throw error - allow login to proceed but user will see error message
        this.logger.warn(`[LOGIN] Login allowed but user ${user.id} will need to re-authenticate for email sync to work`);
      } else if (user && user.googleCalendarRefreshToken) {
        // User has existing refresh token - preserve it
        this.logger.log(`[LOGIN] Preserving existing refresh token since Google didn't provide a new one`);
        writeDebugLog(`[LOGIN] Preserving existing refresh token since Google didn't provide a new one`);
      }
    }

    if (!user) {
      // Create new user - but we already checked for refresh token above
      if (!refreshToken) {
        // Can't create new user without refresh token - this is critical
        throw new Error('Google OAuth did not provide a refresh token. Please try logging in again. If the issue persists, you may need to revoke app access at https://myaccount.google.com/permissions and try again.');
      }
      user = await this.usersService.create({
        email,
        name: profile.displayName,
        password: '', // No password for Google users
        googleId: profile.id,
        googleCalendarAccessToken: accessToken,
        googleCalendarRefreshToken: refreshToken,
        isApproved: isJeremy, // Auto-approve jeremy
        isAdmin: isJeremy, // Make jeremy admin
        needsRelogin: false, // New login = no need to relogin
      });
    } else {
      // Update tokens for existing user
      // Also ensure jeremy is approved and admin
      const updates: any = {
        googleId: profile.id,
        googleCalendarAccessToken: accessToken,
        // Only update refresh token if we got a new one, otherwise preserve existing
        ...(refreshToken ? { googleCalendarRefreshToken: refreshToken } : {}),
        needsRelogin: refreshToken ? false : (user.needsRelogin || false), // Only clear if we got refresh token
      };
      if (isJeremy) {
        updates.isApproved = true;
        updates.isAdmin = true;
      }
      const logMsg1 = `[LOGIN] Updating user ${user.id} with tokens. Current updatedAt: ${user.updatedAt?.toISOString() || 'null'}`;
      this.logger.log(logMsg1);
      writeDebugLog(logMsg1);
      
      const logMsg2 = `[LOGIN] Updates to apply: ${JSON.stringify({ ...updates, googleCalendarAccessToken: updates.googleCalendarAccessToken ? '[REDACTED]' : null, googleCalendarRefreshToken: updates.googleCalendarRefreshToken ? '[REDACTED]' : null })}`;
      this.logger.log(logMsg2);
      writeDebugLog(logMsg2);
      
      const updatedUser = await this.usersService.update(user.id, updates);
      
      const logMsg3 = `[LOGIN] User updated. New updatedAt: ${updatedUser.updatedAt?.toISOString() || 'null'}`;
      this.logger.log(logMsg3);
      writeDebugLog(logMsg3);
      
      user = await this.usersService.findOne(user.id);
      
      const logMsg4 = `[LOGIN] User re-fetched. Final updatedAt: ${user.updatedAt?.toISOString() || 'null'}`;
      this.logger.log(logMsg4);
      writeDebugLog(logMsg4);
      
      const logMsg5 = `[LOGIN] Final user state - hasRefreshToken: ${!!user.googleCalendarRefreshToken}, hasAccessToken: ${!!user.googleCalendarAccessToken}`;
      this.logger.log(logMsg5);
      writeDebugLog(logMsg5);
    }

    // Check if user is approved (unless it's jeremy who was just auto-approved)
    if (!user.isApproved && !isJeremy) {
      throw new Error('Your account is pending approval. Please wait for admin approval.');
    }

    const { password, ...result } = user;
    
    // Log successful login
    try {
      const { authLogger } = require('./auth-logger');
      authLogger.logAuthFailure(
        user.id,
        user.email || null,
        'LOGIN_SUCCESS',
        null,
        {
          isNewUser,
          hasRefreshToken: !!user.googleCalendarRefreshToken,
          hasAccessToken: !!user.googleCalendarAccessToken,
          action: 'User successfully logged in via Google OAuth',
        }
      );
    } catch (logError) {
      console.error('Failed to log login success:', logError);
    }
    
    // Trigger email sync asynchronously via queue with a small delay to let tokens stabilize
    // Delay by 2 seconds to ensure tokens are fully saved in DB before sync attempts
    setTimeout(() => {
      this.boss.send('sync-emails', { userId: user.id }).catch(err => console.error('Failed to add sync job', err));
    }, 2000);
    
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
        needsRelogin: user.needsRelogin,
        hasSeenTour: user.hasSeenTour,
        hasScannedHistory: user.hasScannedHistory,
        isAdmin: user.isAdmin,
        isApproved: user.isApproved,
        termsAcceptedAt: user.termsAcceptedAt,
        privacyAcceptedAt: user.privacyAcceptedAt,
        termsVersion: user.termsVersion,
        privacyVersion: user.privacyVersion,
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

