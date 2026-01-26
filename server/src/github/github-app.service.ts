import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import axios from "axios";

interface GitHubUser {
  id: number;
  login: string;
  name?: string;
  email?: string;
  avatar_url: string;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

@Injectable()
export class GitHubAppService {
  private readonly logger = new Logger(GitHubAppService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly frontendUrl: string;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.clientId =
      this.configService.get<string>("GITHUB_APP_CLIENT_ID") || "";
    this.clientSecret =
      this.configService.get<string>("GITHUB_APP_CLIENT_SECRET") || "";
    this.redirectUri =
      this.configService.get<string>("GITHUB_APP_REDIRECT_URI") || "";
    this.frontendUrl =
      this.configService.get<string>("FRONTEND_URL") || "http://localhost:3000";

    this.logger.log(`[GitHubAppService] Initialized with:`);
    this.logger.log(`  - clientId: ${this.clientId ? "[SET]" : "[MISSING]"}`);
    this.logger.log(
      `  - clientSecret: ${this.clientSecret ? "[SET]" : "[MISSING]"}`,
    );
    this.logger.log(`  - redirectUri: ${this.redirectUri || "[MISSING]"}`);
  }

  /**
   * Generate GitHub OAuth authorization URL
   */
  getAuthorizationUrl(userId: string): string {
    const state = Buffer.from(
      JSON.stringify({ userId, action: "connect" }),
    ).toString("base64");

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: "issues read:project read:org",
      state,
    });
    // Note: Organization-level projects require the app to be installed on the organization
    // This OAuth flow provides user-level access. For org projects, admins must install the app

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<string> {
    try {
      const response = await axios.post<GitHubTokenResponse>(
        "https://github.com/login/oauth/access_token",
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
        },
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.data.access_token) {
        throw new Error("No access token in response");
      }

      return response.data.access_token;
    } catch (error) {
      this.logger.error(`Failed to exchange code for token: ${error}`);
      throw new Error("Failed to exchange authorization code for token");
    }
  }

  /**
   * Fetch user info from GitHub
   */
  async getUserInfo(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await axios.get<GitHubUser>(
        "https://api.github.com/user",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch GitHub user info: ${error}`);
      throw new Error("Failed to fetch GitHub user info");
    }
  }

  /**
   * Store GitHub access token for user
   */
  async storeTokenForUser(userId: string, accessToken: string): Promise<void> {
    const encryptedToken = EncryptionHelper.encrypt(accessToken);
    await this.usersService.update(userId, { githubToken: encryptedToken });
    this.logger.log(`Stored GitHub token for user ${userId}`);
  }

  /**
   * Remove GitHub token for user
   */
  async removeTokenForUser(userId: string): Promise<void> {
    await this.usersService.update(userId, { githubToken: null });
    this.logger.log(`Removed GitHub token for user ${userId}`);
  }

  /**
   * Get frontend URL for redirects
   */
  getFrontendUrl(): string {
    return this.frontendUrl;
  }
}
