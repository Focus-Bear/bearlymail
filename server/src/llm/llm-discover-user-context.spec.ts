import { Logger } from "@nestjs/common";

import { LLMProvider } from "./llm.types";
import {
  discoverUserContextWithEscalation,
  DiscoveryThreadStub,
  formatDiscoveryThreads,
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
});

describe("discoverUserContextWithEscalation", () => {
  const params = {
    threads: [stub()],
    userEmail: "me@example.com",
    existingCategories: [],
    existingVipContacts: [],
    userId: "user-1",
  };

  it("uses Nova only when it returns categories", async () => {
    const generateText = jest.fn().mockResolvedValue(goodResponse);
    const result = await discoverUserContextWithEscalation(
      { generateText },
      silentLogger,
      params,
    );
    expect(result?.categories).toHaveLength(2);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][1]).toBe(LLMProvider.BEDROCK);
  });

  it("escalates to Gemini when Nova returns no categories", async () => {
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
  });

  it("escalates when Nova throws and returns null if both fail", async () => {
    const generateText = jest
      .fn()
      .mockRejectedValueOnce(new Error("bedrock down"))
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
