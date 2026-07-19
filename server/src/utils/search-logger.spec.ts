jest.mock("fs", () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

import * as fs from "fs";

const mockedFs = fs as jest.Mocked<typeof fs>;

describe("search-logger", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockedFs.existsSync.mockReset();
    mockedFs.mkdirSync.mockReset();
    mockedFs.appendFileSync.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("does NOT write to the log file in production (regression for ENOENT crash)", () => {
    // Regression: in production the /app/logs directory does not exist.
    // appendFileSync used to throw ENOENT, propagate up, and break all searches.
    process.env.NODE_ENV = "production";
    mockedFs.appendFileSync.mockImplementation(() => {
      throw Object.assign(
        new Error(
          "ENOENT: no such file or directory, open '/app/logs/search-system.log'",
        ),
        { code: "ENOENT" },
      );
    });

    let searchLogger: {
      searchLogger: { logSearchStart: (userId: string, query: string) => void };
    };
    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        searchLogger = require("./search-logger");
        searchLogger.searchLogger.logSearchStart("user-123", "test query");
      });
    }).not.toThrow();

    expect(mockedFs.appendFileSync).not.toHaveBeenCalled();
  });

  it("writes to the log file in development", () => {
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(true);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { searchLogger: logger } = require("./search-logger");
      logger.logSearchStart("user-123", "test query");
    });

    expect(mockedFs.appendFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockedFs.appendFileSync.mock.calls[0];
    expect(filePath).toMatch(/search-system\.log$/);
    expect(content).toMatch(/\[SEARCH\] User: user-123/);
  });

  it("swallows file-write errors in development without crashing", () => {
    process.env.NODE_ENV = "development";
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.appendFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { searchLogger: logger } = require("./search-logger");
        logger.logSearchStart("user-123", "test query");
      });
    }).not.toThrow();
  });
});
