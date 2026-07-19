import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import axios from "axios";
import { Request } from "express";
import { Strategy } from "passport-oauth2";

import { HTTP_STATUS } from "../constants/http-status";
import { User } from "../database/entities/user.entity";
import { deriveMailApiBase } from "../emails/providers/zoho/zoho-client";
import { AuthService } from "./auth.service";
import { writeDebugLog } from "./auth-logger";

interface ZohoProfile {
  ZUID: string;
  Email: string;
  Display_Name?: string;
  First_Name?: string;
  Last_Name?: string;
}

interface UserWithZohoData extends Omit<User, "password"> {
  zohoProfile?: ZohoProfile;
  zohoAccessToken?: string;
  zohoRefreshToken?: string;
  zohoId?: string;
  accountsServer?: string;
}

const DEFAULT_ACCOUNTS_SERVER = "https://accounts.zoho.com";

/**
 * Strict allowlist of Zoho's published accounts-server URLs. We POST the
 * client_secret to whichever one we accept here, so anything not on this
 * list must be rejected — a regex like `^https://accounts\.zoho\.` would
 * match `accounts.zoho.evil.com` and leak credentials.
 */
const ZOHO_ACCOUNT_SERVERS: ReadonlySet<string> = new Set([
  "https://accounts.zoho.com",
  "https://accounts.zoho.com.au",
  "https://accounts.zoho.eu",
  "https://accounts.zoho.in",
  "https://accounts.zoho.jp",
  "https://accounts.zoho.com.cn",
  "https://accounts.zoho.sa",
  "https://accounts.zohocloud.ca",
]);

/**
 * Zoho is a region-specific service: accounts.zoho.com (US), .com.au (AU),
 * .eu, .in, .jp. OAuth codes are DC-locked — an AU code can only be exchanged
 * at accounts.zoho.com.au. Zoho reports the user's DC on the callback via the
 * `accounts-server` query param; we read it there and persist it per-account
 * so token refresh and Mail API calls also target the right DC.
 */
@Injectable()
export class ZohoStrategy extends PassportStrategy(Strategy, "zoho") {
  private readonly logger = new Logger(ZohoStrategy.name);
  private readonly clientID: string;
  private readonly clientSecret: string;
  private readonly callbackURL: string;
  private readonly defaultAccountsServer: string;

  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const clientID = configService.get<string>("ZOHO_CLIENT_ID");
    const clientSecret = configService.get<string>("ZOHO_CLIENT_SECRET");
    const callbackURL = configService.get<string>("ZOHO_REDIRECT_URI");
    const defaultAccountsServer =
      configService.get<string>("ZOHO_API_DOMAIN") || DEFAULT_ACCOUNTS_SERVER;

    super({
      authorizationURL: `${defaultAccountsServer}/oauth/v2/auth`,
      tokenURL: `${defaultAccountsServer}/oauth/v2/token`,
      clientID: clientID || "placeholder-client-id",
      clientSecret: clientSecret || "placeholder-client-secret",
      callbackURL: callbackURL || "http://localhost:3001/auth/zoho/callback",
      scope: [
        "aaaserver.profile.READ",
        "ZohoMail.messages.READ",
        "ZohoMail.messages.CREATE",
        "ZohoMail.messages.UPDATE",
        "ZohoMail.accounts.READ",
        "ZohoMail.folders.READ",
        "ZohoMail.folders.ALL",
      ],
    });

    this.clientID = clientID || "";
    this.clientSecret = clientSecret || "";
    this.callbackURL =
      callbackURL || "http://localhost:3001/auth/zoho/callback";
    this.defaultAccountsServer = defaultAccountsServer;

    if (!clientID || !clientSecret || !callbackURL) {
      this.logger.warn(
        "Zoho OAuth credentials not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REDIRECT_URI environment variables.",
      );
    }
  }

  authorizationParams(): Record<string, string> {
    return {
      access_type: "offline",
      prompt: "consent",
    };
  }

  // Required by PassportStrategy mixin, but unused: our `authenticate()`
  // override handles the callback path end-to-end without invoking validate.
  validate(): never {
    throw new Error(
      "ZohoStrategy.validate() should not be called - authenticate() handles the callback directly",
    );
  }

  /**
   * Intercept the OAuth callback. When a `code` is present we do the token
   * exchange ourselves at the DC reported by Zoho's `accounts-server` param,
   * because passport-oauth2's token URL is baked in at construction and would
   * fail for any non-default DC. The initial-redirect leg still delegates to
   * the parent strategy.
   */
  authenticate(req: Request, options?: object): void {
    const code = typeof req.query?.code === "string" ? req.query.code : null;
    const oauthError =
      typeof req.query?.error === "string" ? req.query.error : null;

    if (oauthError) {
      const description =
        typeof req.query?.error_description === "string"
          ? req.query.error_description
          : oauthError;
      this.logger.warn(`[ZohoStrategy] OAuth error from Zoho: ${description}`);
      this.fail({ message: description }, HTTP_STATUS.UNAUTHORIZED);
      return;
    }

    if (!code) {
      // Initial redirect — let passport-oauth2 build the authorize URL.
      super.authenticate(req, options);
      return;
    }

    void this.handleCallback(req).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ZohoStrategy] Callback failed: ${message}`);
      this.error(err instanceof Error ? err : new Error(message));
    });
  }

  private async handleCallback(req: Request): Promise<void> {
    const code = req.query.code as string;
    const accountsServer = this.resolveAccountsServer(req);

    writeDebugLog(
      `[ZohoStrategy] OAuth callback - accountsServer: ${accountsServer}`,
    );
    this.logger.debug(
      `[ZohoStrategy] Exchanging code at ${accountsServer}/oauth/v2/token`,
    );

    const tokens = await this.exchangeCodeForTokens(code, accountsServer);
    const profile = await this.fetchZohoProfile(
      tokens.accessToken,
      accountsServer,
    );

    const user = (await this.authService.validateZohoUser(
      profile,
      tokens.accessToken,
      tokens.refreshToken,
    )) as UserWithZohoData;

    user.zohoProfile = profile;
    user.zohoAccessToken = tokens.accessToken;
    user.zohoRefreshToken = tokens.refreshToken;
    user.zohoId = profile.ZUID;
    user.accountsServer = accountsServer;

    this.success(user);
  }

  /**
   * Pick the accounts-server URL to use for the token exchange.
   * Zoho returns `accounts-server` on the callback for any non-default DC;
   * fall back to the configured default for older clients that don't set it.
   * Validated against a strict allowlist — anything off-list would leak
   * the client_secret to whichever host it pointed at.
   */
  private resolveAccountsServer(req: Request): string {
    const fromQuery = req.query?.["accounts-server"];
    if (typeof fromQuery === "string") {
      // Strip trailing slashes with a linear scan. A greedy `/\/+$/` on this
      // attacker-controlled value backtracks super-linearly (CWE-1333 ReDoS).
      let end = fromQuery.length;
      while (end > 0 && fromQuery[end - 1] === "/") {
        end -= 1;
      }
      const sanitized = fromQuery.slice(0, end);
      if (ZOHO_ACCOUNT_SERVERS.has(sanitized)) {
        return sanitized;
      }
    }
    return this.defaultAccountsServer;
  }

  private async exchangeCodeForTokens(
    code: string,
    accountsServer: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const response = await axios.post(
        `${accountsServer}/oauth/v2/token`,
        new URLSearchParams({
          code,
          client_id: this.clientID,
          client_secret: this.clientSecret,
          redirect_uri: this.callbackURL,
          grant_type: "authorization_code",
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 10000,
        },
      );

      const { access_token, refresh_token, error, error_description } =
        response.data;

      if (error || !access_token) {
        const detail =
          error_description || error || JSON.stringify(response.data);
        throw new Error(
          `Zoho token exchange returned no access_token: ${detail}`,
        );
      }

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        throw new Error(
          `Zoho token exchange failed at ${accountsServer} — status: ${status}, body: ${body}`,
        );
      }
      throw error;
    }
  }

  private async fetchZohoProfile(
    accessToken: string,
    accountsServer: string,
  ): Promise<ZohoProfile> {
    const headers = {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    };

    // Primary: hit the user's actual DC. Fallbacks cover the rare case where
    // /oauth/user/info is unavailable on that DC's accounts server.
    const accountEndpoints = [
      `${accountsServer}/oauth/user/info`,
      `${accountsServer}/oauth/v2/user/info`,
    ];

    for (const url of accountEndpoints) {
      try {
        const response = await axios.get(url, { headers });
        this.logger.debug(`[ZohoStrategy] Profile fetch succeeded at ${url}`);
        return response.data as ZohoProfile;
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : "unknown";
        this.logger.warn(
          `[ZohoStrategy] Profile fetch failed at ${url} — status: ${status}`,
        );
      }
    }

    // Fallback: Mail API on the matching DC.
    const mailEndpoints = [`${deriveMailApiBase(accountsServer)}accounts`];

    for (const url of mailEndpoints) {
      try {
        const response = await axios.get(url, { headers });
        let accounts: unknown[] | null = null;
        if (Array.isArray(response.data?.data)) {
          accounts = response.data.data;
        } else if (Array.isArray(response.data)) {
          accounts = response.data;
        }

        if (accounts && accounts.length > 0) {
          const account = accounts[0] as {
            accountId?: string;
            primaryEmailAddress?: string;
            displayName?: string;
            emailAddress?: { mailId?: string }[];
          };

          const email =
            account.primaryEmailAddress || account.emailAddress?.[0]?.mailId;

          if (account.accountId && email) {
            this.logger.debug(
              `[ZohoStrategy] Mail API fallback succeeded at ${url}`,
            );
            return {
              ZUID: account.accountId,
              Email: email,
              Display_Name: account.displayName,
            };
          }
        }
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : "unknown";
        this.logger.warn(
          `[ZohoStrategy] Mail fallback failed at ${url} — status: ${status}`,
        );
      }
    }

    throw new Error(
      `Failed to fetch Zoho profile from ${accountsServer}. Check logs for status codes.`,
    );
  }
}
