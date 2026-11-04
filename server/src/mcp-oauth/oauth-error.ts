import { HttpStatus } from "@nestjs/common";

import { OAuthErrorCode } from "../constants/mcp-oauth.constants";

/**
 * An OAuth protocol error, answered as RFC 6749 §5.2 JSON (`error`,
 * `error_description`) rather than through Nest's exception format, which
 * OAuth clients don't understand.
 */
export class OAuthError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly description: string,
    readonly status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super(description);
  }

  toJSON(): { error: OAuthErrorCode; error_description: string } {
    return { error: this.code, error_description: this.description };
  }
}
