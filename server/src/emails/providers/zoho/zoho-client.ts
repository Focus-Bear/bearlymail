import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ZohoAccountsService } from "../../../zoho-accounts/zoho-accounts.service";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class ZohoClient {
  private readonly logger = new Logger(ZohoClient.name);
  private readonly zohoApiBase = "https://mail.zoho.com/api";

  constructor(
    private zohoAccountsService: ZohoAccountsService,
    private configService: ConfigService,
  ) {}

  /**
   * Create Zoho Mail API client with access token
   */
  createZohoClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.zohoApiBase,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Refresh Zoho access token if needed
   */
  async refreshTokenIfNeeded(
    userId: string,
    accountId: string,
  ): Promise<string> {
    const account = await this.zohoAccountsService.findById(accountId, userId);
    if (!account) {
      throw new Error("Zoho account not found");
    }

    try {
      const apiDomain =
        this.configService.get<string>("ZOHO_API_DOMAIN") ||
        "https://accounts.zoho.com";
      const response = await axios.post(
        `${apiDomain}/oauth/v2/token`,
        new URLSearchParams({
          client_id: this.configService.get<string>("ZOHO_CLIENT_ID") || "",
          client_secret:
            this.configService.get<string>("ZOHO_CLIENT_SECRET") || "",
          refresh_token: account.refreshToken,
          grant_type: "refresh_token",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const { access_token, refresh_token } = response.data;

      // Update tokens in database
      await this.zohoAccountsService.updateTokens(
        accountId,
        userId,
        access_token,
        refresh_token,
      );

      return access_token;
    } catch (error) {
      this.logger.error("Failed to refresh Zoho token:", error);
      await this.zohoAccountsService.updateTokens(
        accountId,
        userId,
        account.accessToken,
        undefined,
      );
      throw new Error("Token refresh failed");
    }
  }

  /**
   * Get Zoho account ID for a user
   */
  async getAccountId(userId: string, accessToken: string): Promise<string> {
    try {
      const client = this.createZohoClient(accessToken);
      const response = await client.get("/accounts");
      const accounts = response.data.data?.accounts || [];
      if (accounts.length === 0) {
        throw new Error("No Zoho Mail accounts found");
      }
      return accounts[0].accountId;
    } catch (error) {
      this.logger.error("Failed to get Zoho account ID:", error);
      throw error;
    }
  }
}



