import axios from "axios";

import {
  BlockedOutboundAddressError,
  safeAxiosConfig,
} from "../../common/safe-http/safe-http";
import { assertSafeOutboundUrl } from "../../common/url-validation.utils";
import { HTTP_HEADERS } from "../../constants/http-headers";
import { UNSUBSCRIBE } from "../../constants/unsubscribe.constants";

const SUCCESS_STATUS_MIN = 200;
const SUCCESS_STATUS_MAX = 299;

/** The URL fails the SSRF guard, before or at connect time. */
export class UnsafeUnsubscribeUrlError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = UnsafeUnsubscribeUrlError.name;
  }
}

function isBlockedOutbound(error: unknown): boolean {
  if (error instanceof BlockedOutboundAddressError) return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause instanceof BlockedOutboundAddressError;
}

function isSuccessStatus(status: number): boolean {
  return status >= SUCCESS_STATUS_MIN && status <= SUCCESS_STATUS_MAX;
}

/**
 * RFC 8058 one-click unsubscribe: POST `List-Unsubscribe=One-Click` to the
 * sender's https URL. The request goes through the SSRF guard (https only, no
 * userinfo, public addresses only, checked again at connect time) with a
 * timeout and no redirects, so a 3xx counts as a failure rather than being
 * followed somewhere internal.
 *
 * @throws UnsafeUnsubscribeUrlError when the URL may not be requested at all.
 * @throws the axios error for timeouts, network failures and non-2xx replies.
 */
export async function postOneClickUnsubscribe(url: string): Promise<void> {
  try {
    assertSafeOutboundUrl(url, UNSUBSCRIBE.ONE_CLICK_URL_LABEL);
  } catch (error) {
    throw new UnsafeUnsubscribeUrlError(error);
  }
  try {
    await axios.post(url, UNSUBSCRIBE.ONE_CLICK_POST_VALUE, {
      ...safeAxiosConfig({
        timeoutMs: UNSUBSCRIBE.ONE_CLICK_TIMEOUT_MS,
        maxResponseBytes: UNSUBSCRIBE.ONE_CLICK_MAX_RESPONSE_BYTES,
      }),
      headers: {
        [HTTP_HEADERS.CONTENT_TYPE]: UNSUBSCRIBE.ONE_CLICK_CONTENT_TYPE,
      },
      validateStatus: isSuccessStatus,
    });
  } catch (error) {
    if (isBlockedOutbound(error)) throw new UnsafeUnsubscribeUrlError(error);
    throw error;
  }
}
