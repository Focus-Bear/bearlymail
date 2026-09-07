import {
  renderTemplate,
  UNRENDERED_TEMPLATE_SYNTAX_PATTERN,
} from "./prompt-template-renderer";

describe("renderTemplate", () => {
  describe("variables", () => {
    it("substitutes simple variables with or without padding spaces", () => {
      expect(renderTemplate("Hi {{name}} / {{ name }}", { name: "Ann" })).toBe(
        "Hi Ann / Ann",
      );
    });

    it("leaves an undefined variable's tag in place", () => {
      expect(renderTemplate("{{missing}}", {})).toBe("{{missing}}");
    });

    it("resolves dotted paths through nested objects", () => {
      const rendered = renderTemplate(
        "Sender: {{ phishingSignals.senderDomain }} mismatch={{ phishingSignals.hasDomainMismatch }}",
        {
          phishingSignals: {
            senderDomain: "evil.xyz",
            hasDomainMismatch: true,
          },
        },
      );
      expect(rendered).toBe("Sender: evil.xyz mismatch=true");
    });

    it("leaves the tag when a dotted path walks through a non-object", () => {
      expect(renderTemplate("{{ a.b.c }}", { a: { b: "str" } })).toBe(
        "{{ a.b.c }}",
      );
    });

    it("applies the join filter with single- or double-quoted separators", () => {
      const vars = { domains: ["a.com", "b.org"] };
      expect(renderTemplate("{{ domains | join(', ') }}", vars)).toBe(
        "a.com, b.org",
      );
      expect(renderTemplate('{{ domains | join("; ") }}', vars)).toBe(
        "a.com; b.org",
      );
      expect(renderTemplate("{{ domains | join() }}", vars)).toBe("a.comb.org");
    });

    it("renders an empty array joined as an empty string", () => {
      expect(renderTemplate("[{{ items | join(', ') }}]", { items: [] })).toBe(
        "[]",
      );
    });

    it("leaves the tag in place for an unsupported filter", () => {
      expect(renderTemplate("{{ x | upper }}", { x: "a" })).toBe(
        "{{ x | upper }}",
      );
    });

    it("stringifies objects as JSON and arrays comma-joined (legacy behaviour)", () => {
      expect(renderTemplate("{{ obj }}", { obj: { a: 1 } })).toBe('{"a":1}');
      expect(renderTemplate("{{ list }}", { list: ["x", "y"] })).toBe("x,y");
    });
  });

  describe("conditionals", () => {
    it("renders the if branch for truthy values and the else branch otherwise", () => {
      const template = "{% if flag %}yes{% else %}no{% endif %}";
      expect(renderTemplate(template, { flag: true })).toBe("yes");
      expect(renderTemplate(template, { flag: "" })).toBe("no");
      expect(renderTemplate(template, {})).toBe("no");
    });

    it("treats an empty array as falsy and a non-empty array as truthy", () => {
      const template = "{% if items %}some{% else %}none{% endif %}";
      expect(renderTemplate(template, { items: [] })).toBe("none");
      expect(renderTemplate(template, { items: [1] })).toBe("some");
    });

    it("supports `not`", () => {
      const template = "{% if not crossFamily %}same{% else %}cross{% endif %}";
      expect(renderTemplate(template, { crossFamily: false })).toBe("same");
      expect(renderTemplate(template, { crossFamily: true })).toBe("cross");
    });

    it("supports elif chains", () => {
      const template =
        "{% if isThread %}thread{% elif fromName %}from {{fromName}}{% else %}unknown{% endif %}";
      expect(renderTemplate(template, { isThread: true })).toBe("thread");
      expect(
        renderTemplate(template, { isThread: false, fromName: "Sam" }),
      ).toBe("from Sam");
      expect(renderTemplate(template, { isThread: false, fromName: "" })).toBe(
        "unknown",
      );
    });

    it("supports nested if blocks (including inside an elif branch)", () => {
      const template =
        "{% if isThread %}T{% elif fromName %}{% if isUserSender %}sent to {{fromName}}{% else %}received from {{fromName}}{% endif %}{% endif %}";
      expect(
        renderTemplate(template, {
          isThread: false,
          fromName: "Sam",
          isUserSender: true,
        }),
      ).toBe("sent to Sam");
      expect(
        renderTemplate(template, {
          isThread: false,
          fromName: "Sam",
          isUserSender: false,
        }),
      ).toBe("received from Sam");
      expect(renderTemplate(template, { isThread: false, fromName: "" })).toBe(
        "",
      );
    });

    it("evaluates dotted paths in conditions", () => {
      expect(
        renderTemplate("{% if signals.mismatch %}!{% endif %}", {
          signals: { mismatch: true },
        }),
      ).toBe("!");
    });

    it("keeps stray closing tags visible instead of swallowing them", () => {
      expect(renderTemplate("a {% endif %} b", {})).toBe("a {% endif %} b");
    });
  });

  describe("loops", () => {
    it("iterates arrays of objects with item.prop, bare prop, loop.index and loop.index0", () => {
      const template =
        "{% for email in emails %}{{loop.index}}/{{loop.index0}}: {{email.subject}} ({{from}})\n{% endfor %}";
      expect(
        renderTemplate(template, {
          emails: [
            { subject: "A", from: "a@x" },
            { subject: "B", from: "b@x" },
          ],
        }),
      ).toBe("1/0: A (a@x)\n2/1: B (b@x)\n");
    });

    it("iterates arrays of strings with {{item}}", () => {
      expect(
        renderTemplate(
          "{% for rule in rules %}{{loop.index}}. {{rule}}\n{% endfor %}",
          {
            rules: ["first", "second"],
          },
        ),
      ).toBe("1. first\n2. second\n");
    });

    it("renders nothing for a missing or empty list", () => {
      const template = "{% for x in xs %}{{x}}{% endfor %}";
      expect(renderTemplate(template, {})).toBe("");
      expect(renderTemplate(template, { xs: [] })).toBe("");
    });

    it("evaluates conditionals inside the loop body against the item", () => {
      const template =
        "{% for email in emails %}{{email.subject}}{% if email.isThread %} (thread of {{ email.messageCount }}){% endif %}\n{% endfor %}";
      expect(
        renderTemplate(template, {
          emails: [
            { subject: "A", isThread: true, messageCount: 3 },
            { subject: "B", isThread: false },
          ],
        }),
      ).toBe("A (thread of 3)\nB\n");
    });

    it("falls back to outer variables for names the item does not define", () => {
      expect(
        renderTemplate("{% for x in xs %}{{x}}-{{suffix}} {% endfor %}", {
          xs: ["a"],
          suffix: "z",
        }),
      ).toBe("a-z ");
    });
  });

  it("exposes a pattern that detects any leftover template syntax", () => {
    expect(UNRENDERED_TEMPLATE_SYNTAX_PATTERN.test("plain text")).toBe(false);
    expect(UNRENDERED_TEMPLATE_SYNTAX_PATTERN.test("{% endif %}")).toBe(true);
    expect(UNRENDERED_TEMPLATE_SYNTAX_PATTERN.test("{{ a.b }}")).toBe(true);
  });
});
