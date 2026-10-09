import { Server } from "http";

import { HTTP_SERVER_TIMEOUTS } from "../constants/service-constants";

/**
 * Keeps idle keep-alive sockets open longer than the load balancer does, so the
 * load balancer always closes first and never forwards a request onto a socket
 * Node has already torn down (which surfaces as a sporadic, unlogged 502).
 */
export function applyLoadBalancerKeepAlive(server: Server): void {
  server.keepAliveTimeout = HTTP_SERVER_TIMEOUTS.KEEP_ALIVE_MS;
  server.headersTimeout = HTTP_SERVER_TIMEOUTS.HEADERS_MS;
}
