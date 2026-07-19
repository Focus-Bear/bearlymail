jest.mock("fs", () => ({
  mkdirSync: jest.fn(),
  existsSync: jest.fn(),
}));

import * as fs from "fs";

const mockedFs = fs as jest.Mocked<typeof fs>;

describe("ensureLogsDirSync", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockedFs.mkdirSync.mockReset();
    mockedFs.existsSync.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("is a no-op in production — never touches the filesystem", () => {
    // Regression: the hardened `USER node` Dockerfile makes /app non-writeable,
    // so any mkdirSync here throws EACCES and crashes boot before NestFactory
    // even starts. We've eaten that incident twice — this helper exists to
    // make sure every per-feature logger gets the same production-safe gate.
    process.env.NODE_ENV = "production";
    mockedFs.mkdirSync.mockImplementation(() => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    });
    mockedFs.existsSync.mockImplementation(() => {
      throw new Error("should not be called in production");
    });

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ensureLogsDirSync } = require("./logs-dir");
      expect(() => ensureLogsDirSync()).not.toThrow();
    });

    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
    expect(mockedFs.existsSync).not.toHaveBeenCalled();
  });

  it("creates the dir in development when it does not exist", () => {
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(false);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ensureLogsDirSync } = require("./logs-dir");
      ensureLogsDirSync();
    });

    expect(mockedFs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(mockedFs.mkdirSync.mock.calls[0][1]).toEqual({ recursive: true });
  });

  it("skips mkdir in development when the dir already exists (hot path)", () => {
    // ensureLogsDirSync is invoked on every write in auth-logger /
    // autoresponder-logger — short-circuiting via existsSync saves the mkdir
    // syscall on the hot path.
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(true);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ensureLogsDirSync } = require("./logs-dir");
      ensureLogsDirSync();
    });

    expect(mockedFs.existsSync).toHaveBeenCalledTimes(1);
    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
  });

  it("swallows EACCES in development (sandboxed dev envs)", () => {
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockImplementation(() => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    });

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ensureLogsDirSync } = require("./logs-dir");
      expect(() => ensureLogsDirSync()).not.toThrow();
    });
  });
});

describe("isDevelopment", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("is false when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isDevelopment } = require("./logs-dir");
      expect(isDevelopment).toBe(false);
    });
  });

  it("is true when NODE_ENV is anything else (dev, test, undefined)", () => {
    for (const env of ["development", "test", undefined]) {
      if (env === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = env;
      }
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { isDevelopment } = require("./logs-dir");
        expect(isDevelopment).toBe(true);
      });
    }
  });
});
