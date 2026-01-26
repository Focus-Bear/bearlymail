import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Office365AccountsService } from "../../../office365-accounts/office365-accounts.service";
import axios, { AxiosInstance } from "axios";

@Injectable()
export class Office365Client {
  private readonly logger = new Logger(Office365Client.name);
  private readonly graphApiBase = "https://graph.microsoft.com/v1.0";

  constructor(
    private office365AccountsService: Office365AccountsService,
    private configService: ConfigService,
  ) {}

  /**
   * Create Microsoft Graph API client with access token
   */
  createGraphClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.graphApiBase,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Refresh Office 365 access token if needed
   */
  async refreshTokenIfNeeded(
    userId: string,
    accountId: string,
  ): Promise<string> {
    const account = await this.office365AccountsService.findById(
      accountId,
      userId,
    );
    if (!account) {
      throw new Error("Office 365 account not found");
    }

    try {
      const tenantId =
        this.configService.get<string>("MICROSOFT_TENANT_ID") || "common";
      const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id:
            this.configService.get<string>("MICROSOFT_CLIENT_ID") || "",
          client_secret:
            this.configService.get<string>("MICROSOFT_CLIENT_SECRET") || "",
          refresh_token: account.refreshToken,
          grant_type: "refresh_token",
          scope:
            "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite offline_access",
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      const { access_token, refresh_token } = response.data;

      // Update tokens in database
      await this.office365AccountsService.updateTokens(
        accountId,
        userId,
        access_token,
        refresh_token,
      );

      return access_token;
    } catch (error) {
      this.logger.error("Failed to refresh Microsoft token:", error);
      await this.office365AccountsService.updateTokens(
        accountId,
        userId,
        account.accessToken,
        undefined,
      );
      throw new Error("Token refresh failed");
    }
  }
}
