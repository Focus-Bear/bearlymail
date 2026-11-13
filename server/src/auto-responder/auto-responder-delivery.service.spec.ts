import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import { Contact } from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { ReplyDraft } from "../database/entities/reply-draft.entity";
import { computeEmailHmac } from "../utils/hmac-email";
import {
  AutoResponderDeliveryService,
  AutoResponseDelivery,
} from "./auto-responder-delivery.service";
import {
  AutoResponderDeliveryMode,
  DEFAULT_AUTO_RESPONDER_CONFIG,
} from "./types/auto-responder.types";

describe("AutoResponderDeliveryService", () => {
  let service: AutoResponderDeliveryService;
  const contactRepository = { findOne: jest.fn() };
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const emailRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const replyDraftRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };

  const autoConfig = {
    ...DEFAULT_AUTO_RESPONDER_CONFIG,
    enabled: true,
    deliveryMode: AutoResponderDeliveryMode.AUTO_SEND_KNOWN_SENDERS,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    contactRepository.findOne.mockResolvedValue(null);
    queryBuilder.getOne.mockResolvedValue(null);
    replyDraftRepository.findOne.mockResolvedValue(null);
    const module = await Test.createTestingModule({
      providers: [
        AutoResponderDeliveryService,
        { provide: getRepositoryToken(Contact), useValue: contactRepository },
        { provide: getRepositoryToken(Email), useValue: emailRepository },
        {
          provide: getRepositoryToken(ReplyDraft),
          useValue: replyDraftRepository,
        },
      ],
    }).compile();
    service = module.get(AutoResponderDeliveryService);
  });

  describe("chooseDelivery", () => {
    it("drafts in draft mode without looking the sender up", async () => {
      const delivery = await service.chooseDelivery(
        DEFAULT_AUTO_RESPONDER_CONFIG,
        "user-1",
        "me@mine.com",
        "friend@example.com",
      );
      expect(delivery).toBe(AutoResponseDelivery.DRAFT);
      expect(contactRepository.findOne).not.toHaveBeenCalled();
    });

    it("sends automatically to an existing contact", async () => {
      contactRepository.findOne.mockResolvedValue({ id: "contact-1" });
      const delivery = await service.chooseDelivery(
        autoConfig,
        "user-1",
        "me@mine.com",
        "Friend <Friend@Example.com>",
      );
      expect(delivery).toBe(AutoResponseDelivery.SEND);
      expect(contactRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            emailHash: SearchIndexHelper.hashExact("friend@example.com"),
          },
        }),
      );
    });

    it("sends automatically to someone the user has emailed before", async () => {
      queryBuilder.getOne.mockResolvedValue({ id: "sent-1" });
      const delivery = await service.chooseDelivery(
        autoConfig,
        "user-1",
        "me@mine.com",
        "friend@example.com",
      );
      expect(delivery).toBe(AutoResponseDelivery.SEND);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "email.senderEmailHmac = :userHmac",
        { userHmac: computeEmailHmac("me@mine.com") },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "email.sentByAutoResponder = false",
      );
    });

    it("drafts for an unknown sender even in auto-send mode", async () => {
      const delivery = await service.chooseDelivery(
        autoConfig,
        "user-1",
        "me@mine.com",
        "stranger@example.com",
      );
      expect(delivery).toBe(AutoResponseDelivery.DRAFT);
    });
  });

  describe("saveDraft", () => {
    it("saves the response as the thread's reply draft", async () => {
      const saved = await service.saveDraft(
        "user-1",
        "provider-thread",
        "friend@example.com",
        "<p>Hi</p>",
      );
      expect(saved).toBe(true);
      expect(replyDraftRepository.save).toHaveBeenCalledWith({
        userId: "user-1",
        emailThreadId: "provider-thread",
        content: "<p>Hi</p>",
        replyMode: "reply",
        recipients: "friend@example.com",
      });
    });

    it("never overwrites a draft the user already has", async () => {
      replyDraftRepository.findOne.mockResolvedValue({ id: "draft-1" });
      const saved = await service.saveDraft(
        "user-1",
        "provider-thread",
        "friend@example.com",
        "<p>Hi</p>",
      );
      expect(saved).toBe(false);
      expect(replyDraftRepository.save).not.toHaveBeenCalled();
    });
  });
});
