import { isLocalAppleMailMode } from "./apple-mail-local-mode.util";

describe("isLocalAppleMailMode", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const local = { hostname: "localhost", remoteAddress: "127.0.0.1" };

  beforeEach(() => {
    process.env.NODE_ENV = "development";
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1"])(
    "allows a connection from %s",
    (remoteAddress) => {
      expect(isLocalAppleMailMode({ ...local, remoteAddress }, true)).toBe(
        true,
      );
    },
  );

  it.each(["192.168.1.20", "10.0.0.5", "::ffff:192.168.1.20", undefined, ""])(
    "refuses a connection from %s even when the Host header says localhost",
    (remoteAddress) => {
      expect(isLocalAppleMailMode({ ...local, remoteAddress }, true)).toBe(
        false,
      );
    },
  );

  it("refuses a non-local Host header", () => {
    expect(
      isLocalAppleMailMode({ ...local, hostname: "mail.example.com" }, true),
    ).toBe(false);
  });

  it("refuses in production", () => {
    process.env.NODE_ENV = "production";

    expect(isLocalAppleMailMode(local, true)).toBe(false);
  });

  it("refuses when Apple Mail is not available", () => {
    expect(isLocalAppleMailMode(local, false)).toBe(false);
  });
});
