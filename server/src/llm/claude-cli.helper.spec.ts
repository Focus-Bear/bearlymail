import { Logger } from "@nestjs/common";

const mockSpawnSync = jest.fn();

jest.mock("child_process", () => ({
  ...jest.requireActual("child_process"),
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
}));

import { ClaudeCliClient } from "./claude-cli.helper";

const OK_PROBE = { status: 0, error: undefined };
const FAIL_PROBE = { status: null, error: new Error("spawnSync ENOENT") };

function makeClient(): ClaudeCliClient {
  const logger = new Logger("test");
  jest.spyOn(logger, "log").mockImplementation(() => undefined);
  jest.spyOn(logger, "warn").mockImplementation(() => undefined);
  return new ClaudeCliClient(() => undefined, logger, {
    recordUsage: jest.fn(),
  } as never);
}

describe("ClaudeCliClient.isAvailable backoff/retry", () => {
  let nowSpy: jest.SpyInstance;
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
    mockSpawnSync.mockReset();
  });

  afterEach(() => nowSpy.mockRestore());

  it("caches a successful probe (sticky — no re-probe)", () => {
    mockSpawnSync.mockReturnValue(OK_PROBE);
    const client = makeClient();
    expect(client.isAvailable()).toBe(true);
    expect(client.isAvailable()).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("does not re-probe within the backoff window after a failure", () => {
    mockSpawnSync.mockReturnValue(FAIL_PROBE);
    const client = makeClient();
    expect(client.isAvailable()).toBe(false);
    // Still inside the 30s backoff window.
    now += 5_000;
    expect(client.isAvailable()).toBe(false);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("recovers: re-probes after the backoff window and succeeds", () => {
    mockSpawnSync.mockReturnValueOnce(FAIL_PROBE);
    const client = makeClient();
    expect(client.isAvailable()).toBe(false);

    // Past the 30s backoff window — re-probe is allowed.
    now += 31_000;
    mockSpawnSync.mockReturnValueOnce(OK_PROBE);
    expect(client.isAvailable()).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);

    // Now sticky.
    now += 60_000;
    expect(client.isAvailable()).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
  });
});
