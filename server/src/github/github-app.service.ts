import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import axios from "axios";

import { AUTH_ACTION_TYPES } from "../constants/domain-types";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { sanitizeAxiosError } from "../utils/axios-error.utils";

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
    private jwtService: JwtService,
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
   * Create a signed connect token for secure OAuth initiation
   * This token is short-lived (5 minutes) and prevents userId spoofing
   * @param userId - The user ID to encode in the token
   * @param includeRepo - Whether to request 'repo' scope for private repo access
   */
  createConnectToken(userId: string, includeRepo = false): string {
    return this.jwtService.sign(
      { userId, action: "connect", includeRepo },
      { expiresIn: "5m" },
    );
  }

  /**
   * Verify and extract payload from connect token
   */
  verifyConnectToken(
    token: string,
  ): { userId: string; includeRepo?: boolean } | null {
    try {
      const payload = this.jwtService.verify(token);
      if (payload.action !== AUTH_ACTION_TYPES.CONNECT) {
        this.logger.error("Invalid token action");
        return null;
      }
      return { userId: payload.userId, includeRepo: payload.includeRepo };
    } catch (error) {
      this.logger.error(
        `Failed to verify connect token: ${sanitizeAxiosError(error)}`,
      );
      return null;
    }
  }

  /**
   * Generate GitHub OAuth authorization URL
   * @param userId - The user ID to encode in the state parameter
   * @param includeRepo - Whether to include 'repo' scope for private repository access
   */
  getAuthorizationUrl(userId: string, includeRepo = false): string {
    // Sign the state parameter with JWT for defense-in-depth
    const state = this.jwtService.sign(
      { userId, action: "connect" },
      { expiresIn: "10m" },
    );

    // Base scopes for GitHub integration (issues, projects, org membership).
    // 'project' (read/write) is required to update a Projects v2 item's status;
    // 'read:project' is read-only and cannot perform the mutation.
    // Add 'repo' scope when user needs private repository access.
    const scope = includeRepo
      ? "issues project read:org repo"
      : "issues project read:org";

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope,
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
      this.logger.error(
        `Failed to exchange code for token: ${sanitizeAxiosError(error)}`,
      );
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
      this.logger.error(
        `Failed to fetch GitHub user info: ${sanitizeAxiosError(error)}`,
      );
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
   * Store the connected GitHub login on the user record. Best-effort —
   * the GitHub connection is still useful without it, so callers should
   * not abort the OAuth flow if this fails.
   */
  async storeGithubUsernameForUser(
    userId: string,
    githubUsername: string,
  ): Promise<void> {
    await this.usersService.update(userId, { githubUsername });
    this.logger.log(
      `Stored GitHub username "${githubUsername}" for user ${userId}`,
    );
  }

  /**
   * Remove GitHub token for user
   */
  async removeTokenForUser(userId: string): Promise<void> {
    await this.usersService.update(userId, {
      githubToken: null,
      githubUsername: null,
    });
    this.logger.log(`Removed GitHub token for user ${userId}`);
  }

  /**
   * Get frontend URL for redirects
   */
  getFrontendUrl(): string {
    return this.frontendUrl;
  }
}
