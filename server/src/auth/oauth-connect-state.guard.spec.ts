import { ExecutionContext } from "@nestjs/common";

import { GoogleAuthGuard } from "./google-auth.guard";
import { MicrosoftAuthGuard } from "./microsoft-auth.guard";
import { ZohoAuthGuard } from "./zoho-auth.guard";

/**
 * The connect flow round-trips a signed `state` through the provider. Passport
 * only includes it in the authorize request if the guard forwards it via
 * getAuthenticateOptions — otherwise the callback can't recognise a "connect"
 * and switches accounts instead of linking the new mailbox.
 */
const contextWithQuery = (query: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ query }) }),
  }) as unknown as ExecutionContext;

describe("OAuth connect-state forwarding", () => {
  const guards = [
    ["Google", new GoogleAuthGuard()],
    ["Microsoft", new MicrosoftAuthGuard()],
    ["Zoho", new ZohoAuthGuard()],
  ] as const;

  for (const [name, guard] of guards) {
    describe(`${name}AuthGuard`, () => {
      it("forwards the connect-state to the provider", () => {
        const options = guard.getAuthenticateOptions(
          contextWithQuery({ state: "signed-state" }),
        );
        expect(options).toEqual({ state: "signed-state" });
      });

      it("forwards nothing on plain login (no state)", () => {
        expect(guard.getAuthenticateOptions(contextWithQuery({}))).toEqual({});
      });
    });
  }
});
