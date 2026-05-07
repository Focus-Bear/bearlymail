import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

import { ERROR_MESSAGES } from "../../../constants/error-messages";
import { HTTP_STATUS } from "../../../constants/http-status";
import { MILLISECONDS } from "../../../constants/time-constants";
import { ZohoAccountsService } from "../../../zoho-accounts/zoho-accounts.service";

const FOLDER_CACHE_TTL_MS = MILLISECONDS.HOUR;

@Injectable()
export class ZohoClient {
  private readonly logger = new Logger(ZohoClient.name);
  private readonly zohoApiBase: string;
  private readonly refreshLocks = new Map<string, Promise<string>>();
  private readonly folderMapCache = new Map<
    string,
    { folderMap: Record<string, string>; fetchedAt: number }
  >();

  constructor(
    private zohoAccountsService: ZohoAccountsService,
    private configService: ConfigService,
  ) {
    // Derive mail API domain from ZOHO_MAIL_API_DOMAIN or ZOHO_API_DOMAIN (falls back to .com global default)
    this.zohoApiBase =
      this.configService.get<string>("ZOHO_MAIL_API_DOMAIN") ||
      this.configService.get<string>("ZOHO_API_DOMAIN") ||
      "https://mail.zoho.com/api/";
  }

  createZohoClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: this.zohoApiBase,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }

  async refreshTokenIfNeeded(
    userId: string,
    accountId: string,
  ): Promise<string> {
    // If a refresh is already in progress for this user, reuse it
    const lockKey = `${userId}:${accountId}`;
    if (this.refreshLocks.has(lockKey)) {
      this.logger.debug(`Reusing in-progress refresh for user ${userId}`);
      return this.refreshLocks.get(lockKey)!;
    }

    const refreshPromise = this._doRefresh(userId, accountId).finally(() => {
      this.refreshLocks.delete(lockKey);
    });

    this.refreshLocks.set(lockKey, refreshPromise);
    return refreshPromise;
  }

  private async _doRefresh(userId: string, accountId: string): Promise<string> {
    const account = await this.zohoAccountsService.findById(accountId, userId);
    if (!account) {
      throw new Error(ERROR_MESSAGES.ZOHO_ACCOUNT_NOT_FOUND);
    }

    if (!account.refreshToken) {
      throw new Error("No refresh token available - user must re-login");
    }

    // Use .com as the global default; AU deployments set ZOHO_API_DOMAIN=https://accounts.zoho.com.au
    const apiDomain =
      this.configService.get<string>("ZOHO_API_DOMAIN") ||
      "https://accounts.zoho.com";

    this.logger.debug(`Refreshing token for user ${userId} via ${apiDomain}`);

    try {
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
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000,
        },
      );

      const { access_token, refresh_token } = response.data;

      if (!access_token) {
        this.logger.error(
          `No access_token in refresh response: ${JSON.stringify(response.data)}`,
        );
        throw new Error(
          `Token refresh returned no access_token: ${JSON.stringify(response.data)}`,
        );
      }

      await this.zohoAccountsService.updateTokens(
        accountId,
        userId,
        access_token,
        refresh_token || account.refreshToken,
      );

      this.logger.log(`Token refreshed successfully for user ${userId}`);
      return access_token;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = error.response?.data;
        this.logger.error(
          `Token refresh failed — status: ${status}, body: ${JSON.stringify(body)}`,
        );

        // Rate limited — throw specific error so caller can back off
        if (
          status === HTTP_STATUS.BAD_REQUEST &&
          body?.error_description?.includes("too many requests")
        ) {
          throw new Error("Token refresh rate limited - try again later");
        }
      }
      throw new Error("Token refresh failed");
    }
  }

  async getAccountId(
    userId: string,
    accessToken: string,
  ): Promise<{ zohoAccountId: string; mailboxAddress: string }> {
    try {
      const client = this.createZohoClient(accessToken);
      const response = await client.get("/accounts");

      this.logger.log(`[getAccountId] raw: ${JSON.stringify(response.data)}`);

      const accounts = response.data.data?.accounts || response.data.data || [];

      const accountList = Array.isArray(accounts) ? accounts : [];
      if (accountList.length === 0) {
        throw new Error("No Zoho Mail accounts found");
      }

      const account = accountList[0];
      return {
        zohoAccountId: account.accountId,
        mailboxAddress: account.mailboxAddress,
      };
    } catch (error) {
      this.logger.error("Failed to get Zoho account ID:", error);
      throw error;
    }
  }

  async getFolderMap(
    zohoClient: AxiosInstance,
    zohoAccountId: string,
  ): Promise<Record<string, string>> {
    const cached = this.folderMapCache.get(zohoAccountId);
    if (cached && Date.now() - cached.fetchedAt < FOLDER_CACHE_TTL_MS) {
      this.logger.debug(
        `[getFolderMap] cache hit for account ${zohoAccountId}`,
      );
      return cached.folderMap;
    }

    const foldersResponse = await zohoClient.get(
      `accounts/${zohoAccountId}/folders`,
    );
    const folders: { folderName: string; folderId: string }[] =
      foldersResponse.data.data || [];
    const folderMap = folders.reduce<Record<string, string>>((acc, folder) => {
      acc[folder.folderName.toLowerCase()] = folder.folderId;
      return acc;
    }, {});

    this.folderMapCache.set(zohoAccountId, {
      folderMap,
      fetchedAt: Date.now(),
    });
    this.logger.debug(
      `[getFolderMap] cached ${folders.length} folders for account ${zohoAccountId}`,
    );
    return folderMap;
  }
}
