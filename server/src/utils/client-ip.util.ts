const FORWARDED_FOR_HEADER = "x-forwarded-for";

interface RequestWithAddress {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}

/**
 * The address of the client as the load balancer saw it.
 *
 * The app does not enable Express `trust proxy`, so behind the load balancer
 * `req.ip` is the balancer itself. The balancer appends the address it saw as
 * the LAST X-Forwarded-For entry; earlier entries are client-supplied and can
 * be forged. Without a proxy in front (local runs) the header is absent and
 * `req.ip` is the client.
 */
export function resolveClientIp(request: RequestWithAddress): string | null {
  const forwarded = request.headers?.[FORWARDED_FOR_HEADER];
  const forwardedList = Array.isArray(forwarded)
    ? forwarded.join(",")
    : forwarded;
  const lastHop = forwardedList?.split(",").pop()?.trim();
  return lastHop || request.ip || null;
}
