import type { Office365Provider } from "../office365.provider";
import { getRawMessage } from "./office365-raw-message";

const USER_ID = "user-1";
const ACCOUNT_ID = "account-1";
const MESSAGE_ID = "AAMkAGI2=/abc";
const MIME_SOURCE = Buffer.from(
  "Received: from outlook.example\r\nMessage-ID: <x@example.com>\r\nSubject: Hi\r\n\r\nBody",
);
const unauthorizedError = Object.assign(new Error("Unauthorized"), {
  response: { status: 401 },
});

function buildProvider(graphGet: jest.Mock): {
  provider: Office365Provider;
  refreshTokenIfNeeded: jest.Mock;
} {
  const refreshTokenIfNeeded = jest.fn().mockResolvedValue("new-token");
  const provider = {
    office365AccountsService: {
      findPrimary: jest
        .fn()
        .mockResolvedValue({ id: ACCOUNT_ID, accessToken: "token" }),
    },
    client: {
      createGraphClient: jest.fn(() => ({ get: graphGet })),
      refreshTokenIfNeeded,
    },
  } as unknown as Office365Provider;
  return { provider, refreshTokenIfNeeded };
}

describe("Office365 getRawMessage", () => {
  it("downloads the MIME source from Graph's $value endpoint as bytes", async () => {
    const graphGet = jest.fn().mockResolvedValue({
      data: MIME_SOURCE.buffer.slice(
        MIME_SOURCE.byteOffset,
        MIME_SOURCE.byteOffset + MIME_SOURCE.byteLength,
      ),
    });
    const { provider } = buildProvider(graphGet);

    const raw = await getRawMessage(provider, USER_ID, MESSAGE_ID);

    expect(raw.equals(MIME_SOURCE)).toBe(true);
    expect(graphGet).toHaveBeenCalledWith(
      `/me/messages/${encodeURIComponent(MESSAGE_ID)}/$value`,
      { responseType: "arraybuffer" },
    );
  });

  it("refreshes the token once on 401 and retries", async () => {
    const graphGet = jest
      .fn()
      .mockRejectedValueOnce(unauthorizedError)
      .mockResolvedValueOnce({ data: MIME_SOURCE });
    const { provider, refreshTokenIfNeeded } = buildProvider(graphGet);

    const raw = await getRawMessage(provider, USER_ID, MESSAGE_ID);

    expect(raw.equals(MIME_SOURCE)).toBe(true);
    expect(refreshTokenIfNeeded).toHaveBeenCalledTimes(1);
  });

  it("gives up after one refresh instead of looping on a revoked grant", async () => {
    const graphGet = jest.fn().mockRejectedValue(unauthorizedError);
    const { provider, refreshTokenIfNeeded } = buildProvider(graphGet);

    await expect(getRawMessage(provider, USER_ID, MESSAGE_ID)).rejects.toBe(
      unauthorizedError,
    );
    expect(refreshTokenIfNeeded).toHaveBeenCalledTimes(1);
    expect(graphGet).toHaveBeenCalledTimes(2);
  });
});
