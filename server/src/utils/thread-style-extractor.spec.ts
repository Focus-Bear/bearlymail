import {
  analyzeThreadStyle,
  extractGreetingStyle,
  extractSignOffName,
} from "./thread-style-extractor";

describe("thread-style-extractor", () => {
  describe("extractSignOffName", () => {
    it("should extract name from 'Thanks, Sam' pattern", () => {
      const body = `Hi there,

Thanks for sending this over. I'll review it later today.

Thanks,
Sam`;
      expect(extractSignOffName(body)).toBe("Sam");
    });

    it("should extract name from 'Cheers, Name' pattern", () => {
      const body = `Got it, will do.

Cheers,
Mike`;
      expect(extractSignOffName(body)).toBe("Mike");
    });

    it("should extract name from 'Best, Name' pattern", () => {
      const body = `I'll get back to you tomorrow.

Best,
Sarah`;
      expect(extractSignOffName(body)).toBe("Sarah");
    });

    it("should extract name from standalone name at end", () => {
      const body = `Sounds good!

Alex`;
      expect(extractSignOffName(body)).toBe("Alex");
    });

    it("should extract name from 'Thanks Name' pattern (inline)", () => {
      const body = `Got it, thanks Sam`;
      expect(extractSignOffName(body)).toBe("Sam");
    });

    it("should not extract excluded words like Monday", () => {
      const body = `Let's chat on Monday`;
      expect(extractSignOffName(body)).toBeNull();
    });

    it("should return null for empty body", () => {
      expect(extractSignOffName("")).toBeNull();
      expect(extractSignOffName("   ")).toBeNull();
    });

    it("should handle HTML content", () => {
      const body = `<div>Thanks for this!</div><br><br>Thanks,<br>John`;
      expect(extractSignOffName(body)).toBe("John");
    });

    it("should extract name from 'Kind regards, Name' pattern", () => {
      const body = `Please let me know if you have questions.

Kind regards,
Emma`;
      expect(extractSignOffName(body)).toBe("Emma");
    });

    it("should extract hyphenated names like Mary-Anne", () => {
      const body = `Thanks for your help!

Best,
Mary-Anne`;
      expect(extractSignOffName(body)).toBe("Mary-Anne");
    });

    it("should extract names with apostrophes like O'Connor", () => {
      const body = `Let me know if you need anything else.

Cheers,
O'Connor`;
      expect(extractSignOffName(body)).toBe("O'Connor");
    });

    it("should extract names with mixed case like McFly", () => {
      const body = `I'll follow up tomorrow.

Thanks,
McFly`;
      expect(extractSignOffName(body)).toBe("McFly");
    });
  });

  describe("extractGreetingStyle", () => {
    it("should extract 'Hey' greeting style", () => {
      const body = `Hey Jeremy,

How's it going?`;
      expect(extractGreetingStyle(body)).toBe("Hey");
    });

    it("should extract 'Hi' greeting style", () => {
      const body = `Hi there,

Just wanted to follow up.`;
      expect(extractGreetingStyle(body)).toBe("Hi");
    });

    it("should extract 'Hello' greeting style", () => {
      const body = `Hello Mike,

Thanks for reaching out.`;
      expect(extractGreetingStyle(body)).toBe("Hello");
    });

    it("should extract greeting with user name", () => {
      const body = `Hey Jeremy,

Quick question...`;
      expect(extractGreetingStyle(body, "Jeremy")).toBe("Hey");
    });

    it("should return null if no greeting found", () => {
      const body = `Just wanted to follow up on this.`;
      expect(extractGreetingStyle(body)).toBeNull();
    });

    it("should return null for empty body", () => {
      expect(extractGreetingStyle("")).toBeNull();
    });

    it("should handle HTML content", () => {
      const body = `<div>Hi Sarah,</div><br>Hope you're well!`;
      expect(extractGreetingStyle(body)).toBe("Hi");
    });

    it("should be case insensitive", () => {
      const body = `HEY there,

What's up?`;
      expect(extractGreetingStyle(body)).toBe("Hey");
    });

    it("should extract greeting with full display name by using first name", () => {
      const body = `Hi Jeremy,

Quick question...`;
      expect(extractGreetingStyle(body, "Jeremy Nagel")).toBe("Hi");
    });
  });

  describe("analyzeThreadStyle", () => {
    it("should extract both preferred name and greeting style", () => {
      const messages = [
        {
          body: `Hey Jeremy,

Let me check on that.

Thanks,
Sam`,
        },
      ];

      const result = analyzeThreadStyle(messages, "Jeremy");

      expect(result.preferredName).toBe("Sam");
      expect(result.greetingStyle).toBe("Hey");
    });

    it("should use most recent message for extraction", () => {
      const messages = [
        {
          body: `Hey Jeremy,

Thanks,
Sam`,
        },
        {
          body: `Hi Jeremy,

Best,
Samuel`,
        },
      ];

      const result = analyzeThreadStyle(messages, "Jeremy");

      expect(result.preferredName).toBe("Sam");
      expect(result.greetingStyle).toBe("Hey");
    });

    it("should return null values if nothing found", () => {
      const messages = [
        {
          body: `Just checking in.`,
        },
      ];

      const result = analyzeThreadStyle(messages);

      expect(result.preferredName).toBeNull();
      expect(result.greetingStyle).toBeNull();
    });

    it("should handle empty messages array", () => {
      const result = analyzeThreadStyle([]);

      expect(result.preferredName).toBeNull();
      expect(result.greetingStyle).toBeNull();
    });

    it("should find name in later message if first has none", () => {
      const messages = [
        {
          body: `Just checking in.`,
        },
        {
          body: `Thanks,
Mike`,
        },
      ];

      const result = analyzeThreadStyle(messages);

      expect(result.preferredName).toBe("Mike");
    });
  });
});
