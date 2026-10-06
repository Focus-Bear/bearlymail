import { createServer } from "http";

import { HTTP_SERVER_TIMEOUTS } from "../constants/service-constants";
import { applyLoadBalancerKeepAlive } from "./http-server-timeouts";

const ALB_DEFAULT_IDLE_TIMEOUT_MS = 60_000;

describe("applyLoadBalancerKeepAlive", () => {
  it("keeps idle sockets open longer than the ALB idle timeout", () => {
    const server = createServer();

    applyLoadBalancerKeepAlive(server);

    expect(server.keepAliveTimeout).toBe(HTTP_SERVER_TIMEOUTS.KEEP_ALIVE_MS);
    expect(server.keepAliveTimeout).toBeGreaterThan(
      ALB_DEFAULT_IDLE_TIMEOUT_MS,
    );
  });

  it("sets headersTimeout above keepAliveTimeout", () => {
    const server = createServer();

    applyLoadBalancerKeepAlive(server);

    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
  });
});
