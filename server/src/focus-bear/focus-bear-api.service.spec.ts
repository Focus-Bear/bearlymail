import {
  FOCUS_BEAR_API,
  FOCUS_BEAR_CONNECTION_METHODS,
} from "../constants/focus-bear.constants";
import { FocusBearApiError, FocusBearCredential } from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";

const TOKEN = "fb_token_value";
const PASTED_TOKEN: FocusBearCredential = {
  method: FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN,
  accessToken: TOKEN,
};
const SIGNED_IN: FocusBearCredential = {
  method: FOCUS_BEAR_CONNECTION_METHODS.OAUTH,
  accessToken: "eyJ.signed-in.token",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("FocusBearApiService", () => {
  const service = new FocusBearApiService();
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    delete process.env[FOCUS_BEAR_API.BASE_URL_ENV];
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("posts the task to the MCP suggest-project route with a pasted token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { project: null, projects: [] }),
    );

    await service.suggestProject(PASTED_TOKEN, {
      title: "Complete the form",
      emailSubject: "Evaluation",
      sender: "NIT",
    });

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      `${FOCUS_BEAR_API.DEFAULT_BASE_URL}${FOCUS_BEAR_API.PASTED_TOKEN_PATHS.SUGGEST_PROJECT}`,
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body)).toEqual({
      title: "Complete the form",
      email_subject: "Evaluation",
      sender: "NIT",
    });
  });

  it("asks for the next free date, with a duration only when there is one", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { date: "2026-11-12" }),
    );
    process.env[FOCUS_BEAR_API.BASE_URL_ENV] =
      "https://api.staging.focusbear.io/";

    await expect(service.nextFreeDate(PASTED_TOKEN)).resolves.toEqual({
      date: "2026-11-12",
    });
    await service.nextFreeDate(PASTED_TOKEN, 45);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.staging.focusbear.io${FOCUS_BEAR_API.PASTED_TOKEN_PATHS.NEXT_FREE_DATE}`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.staging.focusbear.io${FOCUS_BEAR_API.PASTED_TOKEN_PATHS.NEXT_FREE_DATE}?duration=45`,
    );
  });

  it("throws the status Focus Bear answered with, never the token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "Invalid" }));

    const error = await service
      .nextFreeDate(PASTED_TOKEN)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FocusBearApiError);
    expect((error as FocusBearApiError).status).toBe(401);
    expect((error as FocusBearApiError).message).not.toContain(TOKEN);
  });

  it("uses the signed-in /to-do routes with a Connect Focus Bear token", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { project: null, projects: [] }),
    );

    await service.suggestProject(SIGNED_IN, { title: "Reply to Ana" });
    await service.nextFreeDate(SIGNED_IN);

    const [suggestUrl, suggestInit] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(suggestUrl).toBe(
      `${FOCUS_BEAR_API.DEFAULT_BASE_URL}${FOCUS_BEAR_API.OAUTH_PATHS.SUGGEST_PROJECT}`,
    );
    expect(suggestInit.headers.Authorization).toBe(
      `Bearer ${SIGNED_IN.accessToken}`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${FOCUS_BEAR_API.DEFAULT_BASE_URL}${FOCUS_BEAR_API.OAUTH_PATHS.NEXT_FREE_DATE}`,
    );
  });
});
