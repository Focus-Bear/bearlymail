jest.mock("fs", () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

import * as fs from "fs";

const mockedFs = fs as jest.Mocked<typeof fs>;

describe("error-logger module load", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockedFs.existsSync.mockReset();
    mockedFs.mkdirSync.mockReset();
    mockedFs.writeFileSync.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("does NOT mkdir or write at module load when NODE_ENV=production", () => {
    // Regression: with the hardened `USER node` Dockerfile, the container has
    // no write perms on /app — so a top-level fs.mkdirSync('/app/logs') throws
    // EACCES and crashes boot. Production must skip the dir setup entirely
    // (writeErrorToFile() returns early when !isDevelopment anyway).
    process.env.NODE_ENV = "production";
    mockedFs.mkdirSync.mockImplementation(() => {
      throw Object.assign(new Error("EACCES: permission denied"), {
        code: "EACCES",
      });
    });
    mockedFs.writeFileSync.mockImplementation(() => {
      throw new Error("should not be called in production");
    });

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./error-logger");
      });
    }).not.toThrow();

    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
    expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
  });

  it("creates the logs dir at module load when NODE_ENV=development", () => {
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(false);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("./error-logger");
    });

    expect(mockedFs.mkdirSync).toHaveBeenCalledTimes(1);
    expect(mockedFs.mkdirSync.mock.calls[0][1]).toEqual({ recursive: true });
    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("swallows EACCES at module load in development (sandboxed dev envs)", () => {
    // Some dev environments (e.g. read-only CI sandboxes) also can't mkdir.
    // The module load should not crash the process.
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockImplementation(() => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    });

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./error-logger");
      });
    }).not.toThrow();
  });
});
