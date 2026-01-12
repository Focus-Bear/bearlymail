import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { EmailProvider } from "./interfaces/email-provider.interface";
import { GmailProvider } from "./providers/gmail.provider";
import { Office365Provider } from "./providers/office365.provider";
import { ZohoProvider } from "./providers/zoho.provider";

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
    @Inject(forwardRef(() => Office365Provider))
    private office365Provider: Office365Provider,
    @Inject(forwardRef(() => ZohoProvider))
    private zohoProvider: ZohoProvider,
  ) {
    // Register providers
    this.providers.set("gmail", gmailProvider);
    this.providers.set("office365", office365Provider);
    this.providers.set("zoho", zohoProvider);
  }

  /**
   * Get the email provider for a user
   * Currently defaults to Gmail, but can be extended to support multiple providers per user
   */
  async getProvider(
    userId: string,
    providerType: string = "gmail",
  ): Promise<EmailProvider | null> {
    const provider = this.providers.get(providerType);
    if (!provider) {
      this.logger.warn(
        `Provider type ${providerType} not found for user ${userId}`,
      );
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
    // Priority order: Gmail first, then Office 365, then Zoho
    const priorityOrder = ["gmail", "office365", "zoho"];

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
          this.logger.error(
            `Failed to sync ${providerType} for user ${userId}`,
            error,
          );
        }
      }
    }
  }

  /**
   * Convert label IDs to human-readable names (Gmail specific for now)
   */
  async convertLabelIdsToNames(
    userId: string,
    labelIds: string[],
  ): Promise<string[]> {
    // Currently only Gmail is supported
    return this.gmailProvider.convertLabelIdsToNames(userId, labelIds);
  }
}
