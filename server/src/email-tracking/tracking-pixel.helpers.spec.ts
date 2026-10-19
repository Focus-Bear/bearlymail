import { OPEN_SOURCE } from "../constants/email-tracking.constants";
import {
  buildTrackingPixelUrl,
  classifyOpenSource,
  extractTrackingTokens,
  generateTrackingToken,
  injectTrackingPixel,
  isPubliclyReachableBaseUrl,
  parseTrackingPixelFilename,
  stripTrackingPixels,
  stripTrackingPixelsFromEmail,
} from "./tracking-pixel.helpers";

const BASE_URL = "https://api.bearlymail.com";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";
const OTHER_TOKEN = "zzzzzzzzzzzzzzzzzzzzzz";
const PIXEL_URL = buildTrackingPixelUrl(BASE_URL, TOKEN);

const countPixels = (html: string) => extractTrackingTokens(html).length;

describe("tracking pixel helpers", () => {
  describe("generateTrackingToken", () => {
    it("produces a 22-char base64url token (128 bits) that parses back", () => {
      const token = generateTrackingToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(parseTrackingPixelFilename(`${token}.gif`)).toBe(token);
    });

    it("never repeats", () => {
      const tokens = new Set(
        Array.from({ length: 500 }, () => generateTrackingToken()),
      );
      expect(tokens.size).toBe(500);
    });
  });

  describe("parseTrackingPixelFilename", () => {
    it.each(["abc.gif", `${TOKEN}.png`, `${TOKEN}`, `../${TOKEN}.gif`])(
      "rejects %s",
      (filename) => {
        expect(parseTrackingPixelFilename(filename)).toBeNull();
      },
    );
  });

  it("builds the public pixel URL under /t/o", () => {
    expect(PIXEL_URL).toBe(`${BASE_URL}/t/o/${TOKEN}.gif`);
  });

  describe("injectTrackingPixel", () => {
    it("adds exactly one pixel inside </body> when present", () => {
      const html = injectTrackingPixel(
        "<html><body><p>Hi</p></body></html>",
        PIXEL_URL,
      );
      expect(countPixels(html)).toBe(1);
      expect(html).toMatch(/<img [^>]+\/><\/body>/);
    });

    it("appends to bodies without a <body> tag", () => {
      const html = injectTrackingPixel("<p>Hi</p>", PIXEL_URL);
      expect(html.startsWith("<p>Hi</p><img")).toBe(true);
      expect(countPixels(html)).toBe(1);
    });

    it("replaces a pixel carried in quoted history instead of adding a second", () => {
      const quoted = injectTrackingPixel(
        "<p>old</p>",
        buildTrackingPixelUrl(BASE_URL, OTHER_TOKEN),
      );
      const html = injectTrackingPixel(`<p>new</p>${quoted}`, PIXEL_URL);
      expect(extractTrackingTokens(html)).toEqual([TOKEN]);
    });
  });

  describe("stripTrackingPixels", () => {
    it("removes our pixels whatever host served them, leaving other images", () => {
      const html =
        `<p>Hi</p><img src="http://other-host:3001/t/o/${TOKEN}.gif" width="1">` +
        `<img src="https://cdn.example.com/logo.png">`;
      const stripped = stripTrackingPixels(html);
      expect(countPixels(stripped)).toBe(0);
      expect(stripped).toContain("logo.png");
    });

    it("passes null and undefined through", () => {
      expect(stripTrackingPixels(null)).toBeNull();
      expect(stripTrackingPixels(undefined)).toBeUndefined();
    });

    it("cleans both body fields of an email", () => {
      const pixelHtml = injectTrackingPixel("<p>x</p>", PIXEL_URL);
      const email = stripTrackingPixelsFromEmail({
        id: "e1",
        body: pixelHtml,
        htmlBody: pixelHtml,
      });
      expect(countPixels(email.body)).toBe(0);
      expect(countPixels(email.htmlBody)).toBe(0);
      expect(email.id).toBe("e1");
    });
  });

  describe("isPubliclyReachableBaseUrl", () => {
    it.each([
      ["https://api.bearlymail.com", true],
      ["http://localhost:3001", false],
      ["http://127.0.0.1:3001", false],
      ["not a url", false],
    ])("%s -> %s", (url, expected) => {
      expect(isPubliclyReachableBaseUrl(url)).toBe(expected);
    });
  });

  describe("classifyOpenSource", () => {
    it("treats Gmail's image proxy as a real open via Gmail", () => {
      expect(
        classifyOpenSource(
          "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
          "66.249.84.1",
        ),
      ).toBe(OPEN_SOURCE.GMAIL_PROXY);
    });

    it("flags Apple Mail Privacy Protection by its bare user agent", () => {
      expect(classifyOpenSource("Mozilla/5.0", "104.28.1.1")).toBe(
        OPEN_SOURCE.APPLE_PRIVACY_PROXY,
      );
    });

    it("flags Apple Mail Privacy Protection by Apple's address block", () => {
      expect(
        classifyOpenSource("Mozilla/5.0 (Macintosh)", "::ffff:17.58.1.2"),
      ).toBe(OPEN_SOURCE.APPLE_PRIVACY_PROXY);
    });

    it("counts everything else as a direct open", () => {
      expect(
        classifyOpenSource(
          "Mozilla/5.0 (Windows NT 10.0) Outlook/16.0",
          "203.0.113.9",
        ),
      ).toBe(OPEN_SOURCE.DIRECT);
      expect(classifyOpenSource(null, null)).toBe(OPEN_SOURCE.DIRECT);
    });
  });
});
