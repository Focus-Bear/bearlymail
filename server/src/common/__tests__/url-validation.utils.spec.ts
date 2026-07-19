import { assertSafeOutboundUrl } from "../url-validation.utils";

describe("assertSafeOutboundUrl", () => {
  describe("valid HTTPS URLs — should not throw", () => {
    const validUrls = [
      "https://example.com",
      "https://example.com/path?q=1",
      "https://hooks.slack.com/services/T000/B000/xxx",
      "https://api.github.com/repos/Focus-Bear/BearlyMail",
      // 192.0.2.0/24 is TEST-NET (RFC 5737), not RFC1918 private space — should be allowed
      "https://192.0.2.1/public",
    ];

    for (const url of validUrls) {
      it(`accepts ${url}`, () => {
        expect(() => assertSafeOutboundUrl(url, "test")).not.toThrow();
      });
    }
  });

  describe("HTTP URLs — should throw", () => {
    it("rejects http:// scheme", () => {
      expect(() =>
        assertSafeOutboundUrl("http://example.com/webhook", "webhook URL"),
      ).toThrow("only https://");
    });
  });

  describe("non-HTTP schemes — should throw", () => {
    it("rejects file:// scheme", () => {
      expect(() =>
        assertSafeOutboundUrl("file:///etc/passwd", "webhook URL"),
      ).toThrow("only https://");
    });

    it("rejects ftp:// scheme", () => {
      expect(() =>
        assertSafeOutboundUrl("ftp://example.com/data", "webhook URL"),
      ).toThrow("only https://");
    });
  });

  describe("private/loopback hosts — should throw (SSRF protection)", () => {
    const privateUrls = [
      ["https://localhost/internal", "localhost"],
      ["https://127.0.0.1/admin", "127.0.0.1"],
      ["https://10.0.0.1/secret", "10.0.0.1"],
      ["https://10.255.255.255/rds", "10.255.255.255"],
      ["https://172.16.0.1/api", "172.16.0.1"],
      ["https://172.31.255.255/api", "172.31.255.255"],
      ["https://192.168.1.1/router", "192.168.1.1"],
      [
        "https://169.254.169.254/latest/meta-data/",
        "169.254.169.254 (AWS metadata)",
      ],
      ["https://[::1]/admin", "::1 (IPv6 loopback)"],
    ] as [string, string][];

    for (const [url, description] of privateUrls) {
      it(`rejects ${description}`, () => {
        expect(() => assertSafeOutboundUrl(url, "webhook URL")).toThrow(
          "private/internal hosts",
        );
      });
    }
  });

  describe("172.16-31 boundary checks", () => {
    it("allows 172.15.x (not in private range)", () => {
      expect(() =>
        assertSafeOutboundUrl("https://172.15.0.1/api", "test"),
      ).not.toThrow();
    });

    it("rejects 172.16.x (start of private range)", () => {
      expect(() =>
        assertSafeOutboundUrl("https://172.16.0.1/api", "test"),
      ).toThrow("private/internal hosts");
    });

    it("rejects 172.31.x (end of private range)", () => {
      expect(() =>
        assertSafeOutboundUrl("https://172.31.255.255/api", "test"),
      ).toThrow("private/internal hosts");
    });

    it("allows 172.32.x (outside private range)", () => {
      expect(() =>
        assertSafeOutboundUrl("https://172.32.0.1/api", "test"),
      ).not.toThrow();
    });
  });

  describe("userinfo injection — should throw (phishing protection)", () => {
    it("rejects URLs with a username", () => {
      expect(() =>
        assertSafeOutboundUrl(
          "https://accounts.google.com@evil.com/auth",
          "OAuth endpoint",
        ),
      ).toThrow("userinfo");
    });

    it("rejects URLs with username and password", () => {
      expect(() =>
        assertSafeOutboundUrl(
          "https://user:pass@evil.com/auth",
          "OAuth endpoint",
        ),
      ).toThrow("userinfo");
    });
  });

  describe("invalid URL — should throw", () => {
    it("rejects non-URL strings", () => {
      expect(() => assertSafeOutboundUrl("not-a-url", "webhook URL")).toThrow(
        "invalid URL",
      );
    });

    it("rejects empty string", () => {
      expect(() => assertSafeOutboundUrl("", "webhook URL")).toThrow(
        "invalid URL",
      );
    });
  });

  describe("label appears in error messages", () => {
    it("includes the provided label in the error", () => {
      expect(() =>
        assertSafeOutboundUrl("http://example.com", "my webhook"),
      ).toThrow("my webhook");
    });
  });
});
