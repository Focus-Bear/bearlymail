import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly apiKey: string | null = null;
  private readonly baseUrl = 'https://api.revenuecat.com/v1';

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('REVENUECAT_API_KEY') || null;
    if (this.apiKey) {
      this.logger.log('RevenueCat API initialized');
    } else {
      this.logger.warn('REVENUECAT_API_KEY not found, RevenueCat features disabled');
    }
  }

  private async makeRevenueCatRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any) {
    if (!this.apiKey) {
      throw new Error('RevenueCat API key not configured');
    }

    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        data,
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(`RevenueCat API error: ${error.message}`, error.response?.data);
      throw error;
    }
  }

  /**
   * Start a 7-day free trial for a user
   */
  async startTrial(userId: string): Promise<{ success: boolean; expiresAt?: Date }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user already has an active subscription
    if (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trial') {
      return { success: false };
    }

    // Start 7-day trial
    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    await this.userRepository.update(userId, {
      subscriptionStatus: 'trial',
      trialStartedAt: trialStartDate,
      subscriptionExpiresAt: trialEndDate,
    });

    this.logger.log(`Started 7-day trial for user ${userId}`);
    return { success: true, expiresAt: trialEndDate };
  }

  /**
   * Check subscription status and update user record
   */
  async checkSubscriptionStatus(userId: string): Promise<{
    status: string;
    expiresAt?: Date;
    isActive: boolean;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Check if subscription has expired
    if (user.subscriptionExpiresAt && user.subscriptionExpiresAt < new Date()) {
      if (user.subscriptionStatus === 'trial' || user.subscriptionStatus === 'active') {
        await this.userRepository.update(userId, {
          subscriptionStatus: 'expired',
        });
        return { status: 'expired', isActive: false };
      }
    }

    // Check RevenueCat if user has a RevenueCat ID
    if (user.revenueCatUserId && this.apiKey) {
      try {
        const customerInfo = await this.makeRevenueCatRequest(`/subscribers/${user.revenueCatUserId}`);
        const activeEntitlements = customerInfo.subscriber?.entitlements || {};
        const activeEntitlementKeys = Object.keys(activeEntitlements).filter(
          key => activeEntitlements[key]?.expires_date === null || 
                 new Date(activeEntitlements[key].expires_date) > new Date()
        );
        
        // Check if user has active entitlement
        if (activeEntitlementKeys.length > 0) {
          // User has active subscription via RevenueCat
          const firstEntitlement = activeEntitlements[activeEntitlementKeys[0]];
          const status = firstEntitlement?.will_renew ? 'active' : 'trial';
          const expiresAt = firstEntitlement?.expires_date
            ? new Date(firstEntitlement.expires_date)
            : undefined;

          await this.userRepository.update(userId, {
            subscriptionStatus: status,
            subscriptionExpiresAt: expiresAt,
            revenueCatUserId: user.revenueCatUserId,
          });

          return { status, expiresAt, isActive: true };
        }
      } catch (error) {
        this.logger.error(`Failed to check RevenueCat subscription for user ${userId}`, error);
      }
    }

    // Fall back to database status
    const isActive = user.subscriptionStatus === 'active' || 
                     (user.subscriptionStatus === 'trial' && 
                      user.subscriptionExpiresAt && 
                      user.subscriptionExpiresAt > new Date());

    return {
      status: user.subscriptionStatus || 'expired',
      expiresAt: user.subscriptionExpiresAt,
      isActive,
    };
  }

  /**
   * Verify if user has active subscription (for middleware/guards)
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const status = await this.checkSubscriptionStatus(userId);
    return status.isActive;
  }

  /**
   * Handle webhook from RevenueCat
   */
  async handleWebhook(payload: any): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn('RevenueCat not initialized, ignoring webhook');
      return;
    }

    try {
      const { event } = payload;
      const { app_user_id, product_id } = event;

      // Find user by RevenueCat ID
      const user = await this.userRepository.findOne({
        where: { revenueCatUserId: app_user_id },
      });

      if (!user) {
        this.logger.warn(`User not found for RevenueCat ID: ${app_user_id}`);
        return;
      }

      // Update subscription status based on event type
      switch (event.type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'PRODUCT_CHANGE':
          // Fetch latest customer info from RevenueCat
          if (this.apiKey) {
            try {
              const customerInfo = await this.makeRevenueCatRequest(`/subscribers/${app_user_id}`);
              const activeEntitlements = customerInfo.subscriber?.entitlements || {};
              const activeEntitlementKeys = Object.keys(activeEntitlements).filter(
                key => activeEntitlements[key]?.expires_date === null || 
                       new Date(activeEntitlements[key].expires_date) > new Date()
              );
              
              if (activeEntitlementKeys.length > 0) {
                const firstEntitlement = activeEntitlements[activeEntitlementKeys[0]];
                const expiresAt = firstEntitlement?.expires_date
                  ? new Date(firstEntitlement.expires_date)
                  : undefined;

                await this.userRepository.update(user.id, {
                  subscriptionStatus: 'active',
                  subscriptionExpiresAt: expiresAt,
                  revenueCatUserId: app_user_id,
                });
              }
            } catch (error) {
              this.logger.error(`Failed to fetch customer info for ${app_user_id}`, error);
            }
          }
          break;

        case 'CANCELLATION':
          await this.userRepository.update(user.id, {
            subscriptionStatus: 'cancelled',
          });
          break;

        case 'EXPIRATION':
          await this.userRepository.update(user.id, {
            subscriptionStatus: 'expired',
          });
          break;
      }

      this.logger.log(`Processed RevenueCat webhook: ${event.type} for user ${user.id}`);
    } catch (error) {
      this.logger.error('Error processing RevenueCat webhook', error);
      throw error;
    }
  }

  /**
   * Link RevenueCat user ID to our user
   */
  async linkRevenueCatUser(userId: string, revenueCatUserId: string): Promise<void> {
    await this.userRepository.update(userId, {
      revenueCatUserId,
    });
    this.logger.log(`Linked RevenueCat user ${revenueCatUserId} to user ${userId}`);
  }

  /**
   * Extend trial or subscription by a specified number of days (admin only)
   */
  async extendTrial(userId: string, days: number): Promise<{ success: boolean; newExpiresAt?: Date }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // Calculate new expiration date
    const now = new Date();
    const currentExpiresAt = user.subscriptionExpiresAt || now;
    const baseDate = currentExpiresAt > now ? currentExpiresAt : now;
    const newExpiresAt = new Date(baseDate);
    newExpiresAt.setDate(newExpiresAt.getDate() + days);

    // Update user subscription
    await this.userRepository.update(userId, {
      subscriptionExpiresAt: newExpiresAt,
      subscriptionStatus: user.subscriptionStatus === 'expired' ? 'trial' : user.subscriptionStatus || 'trial',
    });

    this.logger.log(`Extended trial/subscription for user ${userId} by ${days} days. New expiration: ${newExpiresAt}`);
    return { success: true, newExpiresAt };
  }

  /**
   * Get all users with subscription info (admin only)
   */
  async getAllUsersWithSubscriptions(): Promise<Array<{
    id: string;
    email: string;
    name: string;
    subscriptionStatus: string;
    subscriptionExpiresAt: Date | null;
    trialStartedAt: Date | null;
    createdAt: Date;
  }>> {
    const users = await this.userRepository.find({
      select: ['id', 'email', 'name', 'subscriptionStatus', 'subscriptionExpiresAt', 'trialStartedAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });

    return users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus || 'none',
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      trialStartedAt: user.trialStartedAt,
      createdAt: user.createdAt,
    }));
  }
}
