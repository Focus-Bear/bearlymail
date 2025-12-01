import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EmailProvider } from './interfaces/email-provider.interface';
import { GmailProvider } from './providers/gmail.provider';
// Future: import { OutlookProvider } from './providers/outlook.provider';
// Future: import { TeamsProvider } from './providers/teams.provider';

/**
 * Manages email provider instances and routes requests to the appropriate provider
 * This allows supporting multiple email providers (Gmail, Outlook, MS Teams, etc.)
 */
@Injectable()
export class EmailProviderManager {
  private readonly logger = new Logger(EmailProviderManager.name);
  private providers: Map<string, EmailProvider> = new Map();

  constructor(
    @Inject(forwardRef(() => GmailProvider))
    private gmailProvider: GmailProvider,
    // Future: private outlookProvider: OutlookProvider,
    // Future: private teamsProvider: TeamsProvider,
  ) {
    // Register providers
    this.providers.set('gmail', gmailProvider);
    // Future: this.providers.set('outlook', outlookProvider);
    // Future: this.providers.set('teams', teamsProvider);
  }

  /**
   * Get the email provider for a user
   * Currently defaults to Gmail, but can be extended to support multiple providers per user
   */
  async getProvider(userId: string, providerType: string = 'gmail'): Promise<EmailProvider | null> {
    const provider = this.providers.get(providerType);
    if (!provider) {
      this.logger.warn(`Provider type ${providerType} not found for user ${userId}`);
      return null;
    }

    // Check if user is connected to this provider
    const isConnected = await provider.isConnected(userId);
    if (!isConnected) {
      this.logger.debug(`User ${userId} is not connected to ${providerType}`);
      return null;
    }

    return provider;
  }

  /**
   * Get the primary email provider for a user
   * Tries providers in order of priority: Gmail, Outlook, Teams, etc.
   */
  async getPrimaryProvider(userId: string): Promise<EmailProvider | null> {
    // Priority order: Gmail first, then others
    const priorityOrder = ['gmail']; // Future: ['gmail', 'outlook', 'teams'];
    
    for (const providerType of priorityOrder) {
      const provider = await this.getProvider(userId, providerType);
      if (provider) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Sync emails from all connected providers for a user
   */
  async syncAllProviders(userId: string): Promise<void> {
    for (const [providerType, provider] of this.providers.entries()) {
      if (await provider.isConnected(userId)) {
        try {
          this.logger.debug(`Syncing ${providerType} for user ${userId}`);
          await provider.syncEmails(userId);
        } catch (error) {
          this.logger.error(`Failed to sync ${providerType} for user ${userId}`, error);
        }
      }
    }
  }
}

