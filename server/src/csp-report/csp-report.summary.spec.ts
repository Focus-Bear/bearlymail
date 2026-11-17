import {
  formatCspViolation,
  summarizeCspReportBody,
  toSafeLocation,
} from "./csp-report.summary";

describe("toSafeLocation", () => {
  it.each([
    [
      "https://app.example.com/email/123?token=abc#x",
      "https://app.example.com",
    ],
    ["wss://ws-ap4.pusher.com/app/key?protocol=7", "wss://ws-ap4.pusher.com"],
    ["data:image/png;base64,AAAA", "data:"],
    ["blob:https://app.example.com/1234-5678", "blob:"],
    ["inline", "inline"],
    ["eval", "eval"],
    ["trusted-types-policy", "trusted-types-policy"],
    ["", "unknown"],
    [42, "unknown"],
    [undefined, "unknown"],
    ["not a url\nwith a newline", "unknown"],
  ])("reduces %p to %p", (input, expected) => {
    expect(toSafeLocation(input)).toBe(expected);
  });
});

describe("summarizeCspReportBody", () => {
  it("summarises a legacy report-uri body", () => {
    const summaries = summarizeCspReportBody({
      "csp-report": {
        "document-uri": "https://app.example.com/email/abc?x=1",
        "violated-directive": "img-src 'self' https:",
        "blocked-uri": "http://tracker.example.net/p.gif?u=me@example.com",
        "source-file": "https://app.example.com/assets/index-abc.js",
        disposition: "report",
        "script-sample": "secret()",
      },
    });

    expect(summaries).toEqual([
      {
        directive: "img-src",
        blocked: "http://tracker.example.net",
        documentOrigin: "https://app.example.com",
        sourceOrigin: "https://app.example.com",
        disposition: "report",
      },
    ]);
  });

  it("prefers effective-directive over violated-directive", () => {
    const [summary] = summarizeCspReportBody({
      "csp-report": {
        "effective-directive": "script-src-elem",
        "violated-directive": "script-src",
      },
    });
    expect(summary.directive).toBe("script-src-elem");
  });

  it("summarises Reporting API batches and ignores other report types", () => {
    const summaries = summarizeCspReportBody([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://app.example.com/inbox",
          effectiveDirective: "connect-src",
          blockedURL: "https://us-assets.i.posthog.com/static/recorder.js?v=1",
          disposition: "enforce",
        },
      },
      { type: "deprecation", body: { id: "x" } },
    ]);

    expect(summaries).toEqual([
      {
        directive: "connect-src",
        blocked: "https://us-assets.i.posthog.com",
        documentOrigin: "https://app.example.com",
        sourceOrigin: "unknown",
        disposition: "enforce",
      },
    ]);
  });

  it("caps the number of entries taken from one body", () => {
    const entry = {
      type: "csp-violation",
      body: { effectiveDirective: "img-src", blockedURL: "https://a.test/x" },
    };
    expect(summarizeCspReportBody(Array(50).fill(entry))).toHaveLength(10);
  });

  it.each([[null], ["text"], [{}], [{ "csp-report": "nope" }], [[1, 2]]])(
    "returns nothing for unrecognised body %p",
    (body) => {
      expect(summarizeCspReportBody(body)).toEqual([]);
    },
  );

  it("never echoes unexpected directive or disposition values", () => {
    const [summary] = summarizeCspReportBody({
      "csp-report": {
        "effective-directive": "img_src<script>",
        disposition: "anything",
      },
    });
    expect(summary.directive).toBe("unknown");
    expect(summary.disposition).toBe("unknown");
  });
});

describe("formatCspViolation", () => {
  it("formats a single compact line", () => {
    expect(
      formatCspViolation({
        directive: "img-src",
        blocked: "https://a.test",
        documentOrigin: "https://app.example.com",
        sourceOrigin: "unknown",
        disposition: "report",
      }),
    ).toBe(
      "CSP violation (report): img-src blocked https://a.test on https://app.example.com (source unknown)",
    );
  });
});
