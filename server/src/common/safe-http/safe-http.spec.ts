import axios from "axios";
import { createServer, Server } from "http";
import { AddressInfo } from "net";

import { SAFE_HTTP } from "../../constants/safe-http.constants";
import {
  BlockedOutboundAddressError,
  isPrivateOutboundAllowed,
  safeAxiosConfig,
} from "./safe-http";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV };
  delete process.env[SAFE_HTTP.ALLOW_PRIVATE_ENV_KEY];
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  return (server.address() as AddressInfo).port;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("isPrivateOutboundAllowed", () => {
  afterEach(restoreEnv);

  it("is off unless the flag is set", () => {
    process.env.NODE_ENV = "development";
    expect(isPrivateOutboundAllowed()).toBe(false);
  });

  it.each(["development", "test"])("is on with the flag in %s", (env) => {
    process.env.NODE_ENV = env;
    process.env[SAFE_HTTP.ALLOW_PRIVATE_ENV_KEY] = "true";
    expect(isPrivateOutboundAllowed()).toBe(true);
  });

  it.each(["production", "staging", ""])(
    "is never on in NODE_ENV=%s, even with the flag",
    (env) => {
      process.env.NODE_ENV = env;
      process.env[SAFE_HTTP.ALLOW_PRIVATE_ENV_KEY] = "true";
      expect(isPrivateOutboundAllowed()).toBe(false);
    },
  );
});

describe("safeAxiosConfig", () => {
  let server: Server;
  let port: number;
  let hits: string[];

  beforeEach(async () => {
    restoreEnv();
    hits = [];
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/secret` });
        res.end();
        return;
      }
      if (req.url === "/large") {
        res.end("x".repeat(2048));
        return;
      }
      res.end("ok");
    });
    port = await listen(server);
  });

  afterEach(async () => {
    await close(server);
    restoreEnv();
  });

  it("refuses to connect to a hostname that resolves to a private address", async () => {
    const error = await axios
      .get(`http://localhost:${port}/`, safeAxiosConfig())
      .catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/private\/internal address/);
    expect((error as { cause?: unknown }).cause).toBeInstanceOf(
      BlockedOutboundAddressError,
    );
    expect(hits).toHaveLength(0);
  });

  it("connects to private hosts when the dev flag is set", async () => {
    process.env.NODE_ENV = "test";
    process.env[SAFE_HTTP.ALLOW_PRIVATE_ENV_KEY] = "true";
    const res = await axios.get(`http://localhost:${port}/`, safeAxiosConfig());
    expect(res.data).toBe("ok");
  });

  it("never follows redirects", async () => {
    // An IP literal skips the lookup, which lets the test reach the server.
    const error = await axios
      .get(`http://127.0.0.1:${port}/redirect`, safeAxiosConfig())
      .catch((err: { response?: { status: number } }) => err);
    expect((error as { response?: { status: number } }).response?.status).toBe(
      302,
    );
    expect(hits).toEqual(["/redirect"]);
  });

  it("caps the response size", async () => {
    await expect(
      axios.get(
        `http://127.0.0.1:${port}/large`,
        safeAxiosConfig({ maxResponseBytes: 1024 }),
      ),
    ).rejects.toThrow(/maxContentLength/);
  });
});
