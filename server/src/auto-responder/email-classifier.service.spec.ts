import { Test, TestingModule } from "@nestjs/testing";

import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { LLMService } from "../llm/llm.service";
import { EmailClassifierService } from "./email-classifier.service";

function hasReasonMatching(reasons: string[], pattern: string): boolean {
  return reasons.some((reason) => reason.includes(pattern));
}

describe("EmailClassifierService", () => {
  let service: EmailClassifierService;
  let llmService: jest.Mocked<LLMService>;

  beforeEach(async () => {
    const mockLLMService = {
      generateText: jest.fn(),
    };

    const mockErrorTrackingService = {
      captureException: jest.fn(),
      captureMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailClassifierService,
        {
          provide: LLMService,
          useValue: mockLLMService,
        },
        {
          provide: ErrorTrackingService,
          useValue: mockErrorTrackingService,
        },
      ],
    }).compile();

    service = module.get<EmailClassifierService>(EmailClassifierService);
    llmService = module.get(LLMService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("classifyEmail", () => {
    describe("header-based detection", () => {
      it("should detect automated emails via Auto-Submitted header", async () => {
        const result = await service.classifyEmail(
          {
            from: "test@example.com",
            subject: "Test",
            body: "Test body",
          },
          { "Auto-Submitted": "auto-generated" },
        );

        expect(result.isAutomated).toBe(true);
        expect(result.reasons).toContain(
          "Automated email detected via headers",
        );
      });

      it("should detect newsletters via List-Unsubscribe header", async () => {
        const result = await service.classifyEmail(
          {
            from: "newsletter@company.com",
            subject: "Weekly Update",
            body: "This week's news...",
          },
          { "List-Unsubscribe": "<mailto:unsubscribe@company.com>" },
        );

        expect(result.isNewsletter).toBe(true);
        expect(result.reasons).toContain(
          "Newsletter detected via headers (List-Unsubscribe)",
        );
      });

      it("should detect out-of-office replies", async () => {
        const result = await service.classifyEmail(
          {
            from: "colleague@company.com",
            subject: "Out of Office: Re: Meeting",
            body: "I am currently out of the office...",
          },
          { "Auto-Submitted": "auto-replied" },
        );

        expect(result.isOutOfOffice).toBe(true);
      });

      it("should detect bounces via content-type", async () => {
        const result = await service.classifyEmail(
          {
            from: "mailer-daemon@mail.example.com",
            subject: "Delivery Status Notification",
            body: "Your message could not be delivered...",
          },
          { "Content-Type": "multipart/report; report-type=delivery-status" },
        );

        expect(result.isBounce).toBe(true);
      });
    });

    describe("sender-based detection", () => {
      it("should detect noreply senders as automated", async () => {
        const result = await service.classifyEmail(
          {
            from: "noreply@company.com",
            subject: "Your order confirmation",
            body: "Thank you for your order...",
          },
          {},
        );

        expect(result.isAutomated).toBe(true);
        expect(
          hasReasonMatching(result.reasons, "Automated sender pattern"),
        ).toBe(true);
      });

      it("should detect do-not-reply senders as automated", async () => {
        const result = await service.classifyEmail(
          {
            from: "do-not-reply@service.com",
            subject: "Notification",
            body: "You have a new message...",
          },
          {},
        );

        expect(result.isAutomated).toBe(true);
      });

      it("should detect newsletter senders", async () => {
        const result = await service.classifyEmail(
          {
            from: "newsletter@updates.company.com",
            subject: "Monthly Newsletter",
            body: "Here's what happened this month...",
          },
          {},
        );

        expect(result.isNewsletter).toBe(true);
      });
    });

    describe("subject-based detection", () => {
      it("should detect auto-reply subjects", async () => {
        const result = await service.classifyEmail(
          {
            from: "person@company.com",
            subject: "[Auto-Reply] Re: Your inquiry",
            body: "This is an automatic response...",
          },
          {},
        );

        expect(result.isAutomated).toBe(true);
        expect(
          hasReasonMatching(result.reasons, "Automated subject pattern"),
        ).toBe(true);
      });

      it("should detect out-of-office subjects", async () => {
        const result = await service.classifyEmail(
          {
            from: "colleague@company.com",
            subject: "Out of Office: Meeting request",
            body: "I will be out of the office until...",
          },
          {},
        );

        expect(result.isOutOfOffice).toBe(true);
      });
    });

    describe("cold outreach detection", () => {
      it("should detect cold outreach patterns via LLM when pattern score is moderate", async () => {
        // When pattern score isn't high enough, it falls through to LLM
        // LLM is mocked, so we test the pattern detection path
        llmService.generateText.mockResolvedValue(
          JSON.stringify({
            isAutomated: false,
            isNewsletter: false,
            isColdOutreach: true,
            isOutOfOffice: false,
            personalizationScore: 0.2,
            urgencyLevel: "low",
            reasons: ["Generic sales template detected"],
          }),
        );

        const result = await service.classifyEmail(
          {
            from: "salesperson@company.com",
            subject: "Quick question about your business",
            body: `Dear Sir/Madam,

I hope this finds you well. I wanted to reach out regarding an exciting opportunity.

Would love to schedule a quick 15 minute call to discuss how we can help your company.

Best regards,
Sales Person`,
          },
          {},
        );

        expect(result.isColdOutreach).toBe(true);
        expect(result.personalizationScore).toBeLessThan(0.5);
      });

      it("should detect merge field artifacts as cold outreach via LLM", async () => {
        llmService.generateText.mockResolvedValue(
          JSON.stringify({
            isAutomated: false,
            isNewsletter: false,
            isColdOutreach: true,
            isOutOfOffice: false,
            personalizationScore: 0.1,
            urgencyLevel: "low",
            reasons: ["Merge field artifacts detected"],
          }),
        );

        const result = await service.classifyEmail(
          {
            // Not a newsletter sender pattern
            from: "salesrep@company.com",
            subject: "Special offer for {{COMPANY_NAME}}",
            body: `Hello {FIRST_NAME},

We noticed you've been looking at our products...`,
          },
          {},
        );

        expect(result.isColdOutreach).toBe(true);
      });
    });

    describe("legitimate emails", () => {
      it("should not flag personalized emails as cold outreach", async () => {
        llmService.generateText.mockResolvedValue(
          JSON.stringify({
            isAutomated: false,
            isNewsletter: false,
            isColdOutreach: false,
            isOutOfOffice: false,
            personalizationScore: 0.85,
            urgencyLevel: "medium",
            reasons: [
              "References specific project",
              "Shows prior relationship",
            ],
          }),
        );

        const result = await service.classifyEmail(
          {
            from: "colleague@partner.com",
            fromName: "John Smith",
            subject: "Follow up on Project Alpha discussion",
            body: `Hi there,

Following up on our conversation last week about Project Alpha. 
I've attached the updated requirements document we discussed.

Looking forward to our meeting on Thursday.

Best,
John`,
          },
          {},
        );

        expect(result.isAutomated).toBe(false);
        expect(result.isNewsletter).toBe(false);
        expect(result.isColdOutreach).toBe(false);
      });
    });
  });

  describe("isReplyByHeaders", () => {
    it("should detect replies via In-Reply-To header", () => {
      const result = service.isReplyByHeaders({
        "In-Reply-To": "<message-id@example.com>",
      });
      expect(result).toBe(true);
    });

    it("should detect replies via References header", () => {
      const result = service.isReplyByHeaders({
        References: "<message-id@example.com>",
      });
      expect(result).toBe(true);
    });

    it("should return false for non-replies", () => {
      const result = service.isReplyByHeaders({
        Subject: "New email",
      });
      expect(result).toBe(false);
    });
  });
});
