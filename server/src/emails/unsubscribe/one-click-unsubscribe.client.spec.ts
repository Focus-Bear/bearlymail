import axios from "axios";

import { BlockedOutboundAddressError } from "../../common/safe-http/safe-http";
import { SAFE_HTTP } from "../../constants/safe-http.constants";
import { UNSUBSCRIBE } from "../../constants/unsubscribe.constants";
import {
  postOneClickUnsubscribe,
  UnsafeUnsubscribeUrlError,
} from "./one-click-unsubscribe.client";

const PUBLIC_URL = "https://hs.example.test/unsub?token=abc";

describe("postOneClickUnsubscribe", () => {
  let postSpy: jest.SpyInstance;

  beforeEach(() => {
    delete process.env[SAFE_HTTP.ALLOW_PRIVATE_ENV_KEY];
    postSpy = jest.spyOn(axios, "post").mockResolvedValue({ status: 200 });
  });

  afterEach(() => jest.restoreAllMocks());

  it("POSTs the RFC 8058 body with a timeout, no redirects and the public-only agent", async () => {
    await postOneClickUnsubscribe(PUBLIC_URL);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, body, config] = postSpy.mock.calls[0];
    expect(url).toBe(PUBLIC_URL);
    expect(body).toBe(UNSUBSCRIBE.ONE_CLICK_POST_VALUE);
    expect(config.headers["Content-Type"]).toBe(
      UNSUBSCRIBE.ONE_CLICK_CONTENT_TYPE,
    );
    expect(config.timeout).toBe(UNSUBSCRIBE.ONE_CLICK_TIMEOUT_MS);
    expect(config.maxRedirects).toBe(0);
    expect(config.proxy).toBe(false);
    expect(config.httpsAgent).toBeDefined();
    expect(config.validateStatus(302)).toBe(false);
    expect(config.validateStatus(204)).toBe(true);
  });

  it.each([
    ["loopback", "https://127.0.0.1/unsub"],
    ["private range", "https://10.0.0.5/unsub"],
    ["cloud metadata", "https://169.254.169.254/latest/meta-data"],
    ["IPv6 loopback", "https://[::1]/unsub"],
    ["localhost", "https://localhost/unsub"],
    ["plain http", "http://hs.example.test/unsub"],
    ["javascript:", "javascript:alert(1)"],
    ["userinfo", "https://bank.example.test@evil.test/unsub"],
  ])("refuses a %s URL without sending anything", async (_label, url) => {
    await expect(postOneClickUnsubscribe(url)).rejects.toBeInstanceOf(
      UnsafeUnsubscribeUrlError,
    );
    expect(postSpy).not.toHaveBeenCalled();
  });

  it("reports a host that resolves to a private address as unsafe", async () => {
    postSpy.mockRejectedValue(
      Object.assign(new Error("connect refused"), {
        cause: new BlockedOutboundAddressError("resolves to 10.0.0.1"),
      }),
    );
    await expect(postOneClickUnsubscribe(PUBLIC_URL)).rejects.toBeInstanceOf(
      UnsafeUnsubscribeUrlError,
    );
  });

  it("passes ordinary failures (timeouts, 5xx) through for the caller's fallback", async () => {
    const timeout = new Error("timeout of 10000ms exceeded");
    postSpy.mockRejectedValue(timeout);
    await expect(postOneClickUnsubscribe(PUBLIC_URL)).rejects.toBe(timeout);
  });
});
