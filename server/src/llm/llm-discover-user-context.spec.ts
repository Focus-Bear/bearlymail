import { Logger } from "@nestjs/common";

import { STRONG_GEMINI_MODEL } from "../constants/llm-constants";
import { QUERY_LIMITS } from "../constants/query-limits";
import { LLMProvider } from "./llm.types";
import {
  discoverUserContextWithEscalation,
  DiscoveryThreadStub,
  formatDiscoveryThreads,
  minimumProposedCategories,
  parseDiscoveryResponse,
} from "./llm-discover-user-context";

const silentLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

const stub = (overrides: Partial<DiscoveryThreadStub> = {}) => ({
  threadId: "t1",
  from: "priya@northwind.io",
  fromName: "Priya Raman",
  subject: "Rollout timeline",
  snippet: "Can we move the rollout to the 15th?",
  receivedAt: "2026-09-01T00:00:00.000Z",
  userReplied: true,
  ...overrides,
});

const goodResponse = JSON.stringify({
  categories: [
    { name: "📰 Newsletters", description: "Digests and subscriptions" },
    { name: "🔔 GitHub Notifications", description: "PRs, issues, CI" },
  ],
  vipContacts: [
    { name: "Priya Raman", email: "priya@northwind.io", reason: "client" },
  ],
  urgentHints: ["Production alerts from Sentry"],
  notUrgentHints: [],
});

describe("formatDiscoveryThreads", () => {
  it("renders one numbered line per thread with the reply flag", () => {
    const text = formatDiscoveryThreads([
      stub(),
      stub({ threadId: "t2", fromName: undefined, userReplied: false }),
    ]);
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("1. From: Priya Raman <priya@northwind.io>");
    expect(lines[0]).toContain("UserReplied: yes");
    expect(lines[1]).toContain("2. From: priya@northwind.io");
    expect(lines[1]).toContain("UserReplied: no");
  });
});

describe("parseDiscoveryResponse", () => {
  it("parses a fenced JSON response", () => {
    const result = parseDiscoveryResponse(
      `\`\`\`json\n${goodResponse}\n\`\`\``,
      "me@example.com",
    );
    expect(result?.categories).toHaveLength(2);
    expect(result?.vipContacts[0]).toEqual({
      name: "Priya Raman",
      email: "priya@northwind.io",
      reason: "client",
    });
    expect(result?.urgentHints).toEqual(["Production alerts from Sentry"]);
  });

  it("resolves each category's thread numbers to the sample's thread ids", () => {
    const result = parseDiscoveryResponse(
      JSON.stringify({
        categories: [
          {
            name: "🔐 Login & Access Issues",
            description: "Can't sign in",
            threadNumbers: [1, 3, 3, 99, "x"],
          },
          { name: "💳 Billing & Refunds", description: "Charges" },
        ],
      }),
      null,
      [],
      [],
      ["t1", "t2", "t3"],
    );
    expect(result?.categories).toEqual([
      {
        name: "🔐 Login & Access Issues",
        description: "Can't sign in",
        sourceThreadIds: ["t1", "t3"],
      },
      {
        name: "💳 Billing & Refunds",
        description: "Charges",
        sourceThreadIds: [],
      },
    ]);
  });

  it("returns null for non-JSON output", () => {
    expect(parseDiscoveryResponse("Sorry, I cannot help.", null)).toBeNull();
  });

  it("drops categories the user already has, even with a different emoji", () => {
    const result = parseDiscoveryResponse(
      JSON.stringify({
        categories: [
          { name: "🚨 Monitoring Alerts", description: "a" },
          { name: "🎧 Customer Support", description: "b" },
        ],
      }),
      null,
      ["🔔 Monitoring Alerts"],
    );
    expect(result?.categories.map((category) => category.name)).toEqual([
      "🎧 Customer Support",
    ]);
  });

  it("drops the user themselves from VIPs and de-duplicates category names", () => {
    const result = parseDiscoveryResponse(
      JSON.stringify({
        categories: [
          { name: "📰 Newsletters", description: "a" },
          { name: "Newsletters", description: "b" },
          { name: "", description: "c" },
        ],
        vipContacts: [
          { name: "Me", email: "ME@example.com" },
          { name: "Tom Becker", email: "tom@focusbear.io" },
        ],
      }),
      "me@example.com",
    );
    expect(result?.categories.map((category) => category.name)).toEqual([
      "📰 Newsletters",
    ]);
    expect(result?.vipContacts.map((contact) => contact.name)).toEqual([
      "Tom Becker",
    ]);
    expect(result?.urgentHints).toEqual([]);
    expect(result?.notUrgentHints).toEqual([]);
  });

  it("returns no projects when the model omits them", () => {
    expect(parseDiscoveryResponse(goodResponse, null)?.projects).toEqual([]);
  });

  it("reads current projects, dropping blanks, duplicates and ones the user already has", () => {
    const result = parseDiscoveryResponse(
      JSON.stringify({
        categories: [],
        projects: [
          { name: "Northwind onboarding rollout", reason: "Agreeing dates" },
          { name: "northwind onboarding rollout!", reason: "dup" },
          { name: "  ", reason: "blank" },
          { name: "Landing page redesign" },
          "not an object",
        ],
      }),
      null,
      [],
      ["LANDING PAGE REDESIGN"],
    );
    expect(result?.projects).toEqual([
      { name: "Northwind onboarding rollout", reason: "Agreeing dates" },
    ]);
  });

  it("caps the projects one batch may return", () => {
    const projects = Array.from(
      { length: QUERY_LIMITS.DISCOVERY_MAX_PROJECTS_PER_BATCH + 3 },
      (_, index) => ({ name: `Project ${index}` }),
    );
    const result = parseDiscoveryResponse(
      JSON.stringify({ categories: [], projects }),
      null,
    );
    expect(result?.projects).toHaveLength(
      QUERY_LIMITS.DISCOVERY_MAX_PROJECTS_PER_BATCH,
    );
  });
});

describe("minimumProposedCategories", () => {
  it("asks a full 100-thread sample for the granular target", () => {
    expect(minimumProposedCategories(100, 0)).toBe(
      QUERY_LIMITS.DISCOVERY_MIN_PROPOSED_CATEGORIES,
    );
  });

  it("scales the minimum down for a small sample instead of padding it", () => {
    expect(minimumProposedCategories(20, 0)).toBe(4);
    expect(minimumProposedCategories(3, 0)).toBe(0);
  });

  it("counts the user's existing categories toward the minimum", () => {
    expect(minimumProposedCategories(100, 12)).toBe(3);
    expect(minimumProposedCategories(100, 40)).toBe(0);
  });
});

describe("discoverUserContextWithEscalation", () => {
  const params = {
    threads: [stub()],
    userEmail: "me@example.com",
    existingCategories: [],
    existingVipContacts: [],
    userId: "user-1",
  };

  it("uses Gemini Flash Lite (the default Gemini model) only when it returns categories", async () => {
    const generateText = jest.fn().mockResolvedValue(goodResponse);
    const result = await discoverUserContextWithEscalation(
      { generateText },
      silentLogger,
      params,
    );
    expect(result?.categories).toHaveLength(2);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][1]).toBe(LLMProvider.GEMINI);
    expect(generateText.mock.calls[0][0].model).toBeUndefined();
  });

  it("asks for the granular minimum and allows thread numbers in the answer", async () => {
    const generateText = jest.fn().mockResolvedValue(goodResponse);
    await discoverUserContextWithEscalation({ generateText }, silentLogger, {
      ...params,
      threads: Array.from({ length: 100 }, (_, index) =>
        stub({ threadId: `t${index}` }),
      ),
    });
    const request = generateText.mock.calls[0][0] as { systemPrompt: string };
    expect(request.systemPrompt).toContain(
      `Return at least ${QUERY_LIMITS.DISCOVERY_MIN_PROPOSED_CATEGORIES} categories`,
    );
    expect(request.systemPrompt).toContain('"threadNumbers"');
  });

  it("escalates to the strong Gemini model when Flash Lite returns no categories", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ categories: [] }))
      .mockResolvedValueOnce(goodResponse);
    const result = await discoverUserContextWithEscalation(
      { generateText },
      silentLogger,
      params,
    );
    expect(result?.categories).toHaveLength(2);
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[1][1]).toBe(LLMProvider.GEMINI);
    expect(generateText.mock.calls[1][0].model).toBe(STRONG_GEMINI_MODEL);
  });

  it("escalates when Flash Lite throws and returns null if both fail", async () => {
    const generateText = jest
      .fn()
      .mockRejectedValueOnce(new Error("gemini down"))
      .mockResolvedValueOnce("not json");
    const result = await discoverUserContextWithEscalation(
      { generateText },
      silentLogger,
      params,
    );
    expect(result).toBeNull();
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("does not escalate an empty result on a re-analysis (every bucket may already exist)", async () => {
    const generateText = jest
      .fn()
      .mockResolvedValue(JSON.stringify({ categories: [] }));
    const result = await discoverUserContextWithEscalation(
      { generateText },
      silentLogger,
      { ...params, existingCategories: ["📰 Newsletters"] },
    );
    expect(result?.categories).toEqual([]);
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("asks the model for projects and lists the user's existing ones so they are not re-proposed", async () => {
    const generateText = jest.fn().mockResolvedValue(goodResponse);
    await discoverUserContextWithEscalation({ generateText }, silentLogger, {
      ...params,
      existingProjects: ["Landing page redesign"],
    });
    const request = generateText.mock.calls[0][0] as {
      prompt: string;
      systemPrompt: string;
    };
    expect(request.systemPrompt).toContain('"projects"');
    expect(request.prompt).toMatch(
      /Existing projects[^\n]*\n- Landing page redesign/,
    );
  });

  it("does not call the model for an empty batch", async () => {
    const generateText = jest.fn();
    const result = await discoverUserContextWithEscalation(
      { generateText },
      silentLogger,
      { ...params, threads: [] },
    );
    expect(result).toBeNull();
    expect(generateText).not.toHaveBeenCalled();
  });
});
