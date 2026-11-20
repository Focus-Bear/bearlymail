import { MCPOAuthController } from "./mcp-oauth.controller";
import { bindingValueForState } from "./mcp-oauth.service";

const COOKIE = "bm_mcp_connect";

describe("MCPOAuthController", () => {
  const oauthService = {
    beginAuthorization: jest.fn(),
    completeAuthorization: jest.fn(),
  };
  const serversService = {
    findOne: jest.fn(),
    onOAuthConnected: jest.fn(),
  };
  const controller = new MCPOAuthController(
    oauthService as never,
    serversService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("binds the started authorization to the browser with a cookie", async () => {
    serversService.findOne.mockResolvedValue({ id: "cfg-1" });
    oauthService.beginAuthorization.mockResolvedValue(
      "https://provider.test/authorize?state=state-1",
    );
    const res = { cookie: jest.fn() };

    await controller.start(
      { user: { userId: "user-1", email: "a@b.test" } },
      "cfg-1",
      res as never,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      COOKIE,
      bindingValueForState("state-1"),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });

  describe("callback", () => {
    const callback = (cookie?: string) => {
      const res = { redirect: jest.fn() };
      return controller
        .callback(
          "state-1",
          "code-1",
          "",
          res as never,
          {
            headers: cookie ? { cookie } : {},
          } as never,
        )
        .then(() => res);
    };

    it.each([
      ["no cookie", undefined],
      [
        "a cookie for another authorization",
        `${COOKIE}=${bindingValueForState("state-2")}`,
      ],
    ])("does not exchange the code with %s", async (_label, cookie) => {
      const res = await callback(cookie);

      expect(oauthService.completeAuthorization).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining("mcpConnected=error"),
      );
    });

    it("completes in the browser that started the authorization", async () => {
      oauthService.completeAuthorization.mockResolvedValue({
        id: "cfg-1",
        userId: "user-1",
      });

      const res = await callback(
        `${COOKIE}=${bindingValueForState("state-1")}`,
      );

      expect(oauthService.completeAuthorization).toHaveBeenCalledWith(
        "state-1",
        "code-1",
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining("mcpConnected=success"),
      );
    });
  });
});
