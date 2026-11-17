import { FOCUS_BEAR_API } from "../constants/focus-bear.constants";
import { FocusBearApiError } from "./focus-bear.types";
import { FocusBearApiService } from "./focus-bear-api.service";

const TOKEN = "fb_token_value";

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

  it("posts the task to suggest-project with the user's token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { project: null, projects: [] }),
    );

    await service.suggestProject(TOKEN, {
      title: "Complete the form",
      emailSubject: "Evaluation",
      sender: "NIT",
    });

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      `${FOCUS_BEAR_API.DEFAULT_BASE_URL}${FOCUS_BEAR_API.SUGGEST_PROJECT_PATH}`,
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

    await expect(service.nextFreeDate(TOKEN)).resolves.toEqual({
      date: "2026-11-12",
    });
    await service.nextFreeDate(TOKEN, 45);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.staging.focusbear.io${FOCUS_BEAR_API.NEXT_FREE_DATE_PATH}`,
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.staging.focusbear.io${FOCUS_BEAR_API.NEXT_FREE_DATE_PATH}?duration=45`,
    );
  });

  it("throws the status Focus Bear answered with, never the token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "Invalid" }));

    const error = await service
      .nextFreeDate(TOKEN)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FocusBearApiError);
    expect((error as FocusBearApiError).status).toBe(401);
    expect((error as FocusBearApiError).message).not.toContain(TOKEN);
  });
});
