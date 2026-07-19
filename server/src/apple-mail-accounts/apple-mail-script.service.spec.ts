const mockExecFile = jest.fn();

jest.mock("child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import { existsSync, readFileSync } from "fs";

import { AppleMailScriptService } from "./apple-mail-script.service";

type ExecCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

function mockExecResult(
  stdout: string,
  error: Error | null = null,
  stderr = "",
) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: object, callback: ExecCallback) => {
      callback(error, stdout, stderr);
    },
  );
}

describe("AppleMailScriptService", () => {
  let service: AppleMailScriptService;
  const realPlatform = process.platform;

  const setPlatform = (platform: string) => {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppleMailScriptService();
    setPlatform("darwin");
  });

  afterEach(() => {
    setPlatform(realPlatform);
  });

  it("rejects on non-macOS platforms", async () => {
    setPlatform("linux");
    expect(service.isSupported()).toBe(false);
    await expect(service.listAccounts()).rejects.toThrow(
      "requires the server to run on macOS",
    );
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("parses account list JSON from osascript", async () => {
    mockExecResult(
      JSON.stringify([
        {
          name: "Work",
          enabled: true,
          emails: ["me@work.com"],
          fullName: "Me",
        },
      ]),
    );

    const accounts = await service.listAccounts();
    expect(accounts).toEqual([
      { name: "Work", enabled: true, emails: ["me@work.com"], fullName: "Me" },
    ]);

    const [cmd, args] = mockExecFile.mock.calls[0];
    expect(cmd).toBe("osascript");
    expect(args[0]).toBe("-l");
    expect(args[1]).toBe("JavaScript");
    expect(args[2]).toBe("-e");
  });

  it("passes params via a JSON temp file (argv carries the path, not the payload)", async () => {
    let paramsFileContent: string | null = null;
    mockExecFile.mockImplementation(
      (_cmd: string, args: string[], _opts: object, callback: ExecCallback) => {
        // Read before the service's finally-block unlinks the file.
        paramsFileContent = readFileSync(args[4], "utf8");
        callback(null, JSON.stringify([]), "");
      },
    );
    await service.fetchInboxSummaries({
      accountNames: ["Work"],
      sinceMs: 1000,
      maxMessages: 50,
    });

    const [, args] = mockExecFile.mock.calls[0];
    expect(args[4]).toMatch(/bearlymail-apple-mail-params-.*\.json$/);
    expect(JSON.parse(paramsFileContent!)).toEqual({
      accountNames: ["Work"],
      sinceMs: 1000,
      maxMessages: 50,
    });
    expect(existsSync(args[4])).toBe(false);
  });

  it("short-circuits empty item lists without spawning", async () => {
    await expect(service.fetchMessageDetails([])).resolves.toEqual([]);
    await expect(
      service.setFlagged({ items: [], flagged: true }),
    ).resolves.toEqual({ updated: 0 });
    await expect(
      service.moveMessages({ items: [], target: "archive" }),
    ).resolves.toEqual({ moved: 0, errors: [] });
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("surfaces osascript stderr on failure", async () => {
    mockExecResult(
      "",
      new Error("exit 1"),
      "execution error: Mail got an error",
    );
    await expect(service.listAccounts()).rejects.toThrow(
      "execution error: Mail got an error",
    );
  });

  it("throws on non-JSON output", async () => {
    mockExecResult("not json");
    await expect(service.listAccounts()).rejects.toThrow("non-JSON output");
  });

  it("logs move errors but still returns the result", async () => {
    mockExecResult(
      JSON.stringify({ moved: 1, errors: ["No archive mailbox on account X"] }),
    );
    const result = await service.moveMessages({
      items: [
        { accountName: "Work", appleId: 1 },
        { accountName: "Work", appleId: 2 },
      ],
      target: "archive",
    });
    expect(result.moved).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
