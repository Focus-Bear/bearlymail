import { BadRequestException } from "@nestjs/common";
import type { Request as ExpressRequest, Response } from "express";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { AskAiController } from "./ask-ai.controller";
import { AskAiAgentOptions } from "./ask-ai.types";
import { AskAiAgentService } from "./ask-ai-agent.service";

function emailRow(partial: Partial<Email>): Email {
  return {
    id: "e1",
    userId: "u1",
    emailThreadId: "thread-1",
    from: "a@x.com",
    fromName: "A",
    subject: "Re: AADPA 2026",
    body: "body",
    receivedAt: new Date("2026-01-01T00:00:00Z"),
    ...partial,
  } as Email;
}

describe("AskAiController", () => {
  let agent: jest.Mocked<
    Pick<AskAiAgentService, "ask" | "claimApproval" | "resume">
  >;
  let emailRepo: jest.Mocked<Pick<Repository<Email>, "findOne" | "find">>;
  let controller: AskAiController;

  const req = { user: { userId: "u1" } };

  beforeEach(() => {
    agent = {
      ask: jest.fn().mockResolvedValue({ answer: "ok", toolActivity: [] }),
      claimApproval: jest.fn(),
      resume: jest.fn(),
    };
    emailRepo = { findOne: jest.fn(), find: jest.fn() };
    controller = new AskAiController(
      agent as unknown as AskAiAgentService,
      emailRepo as unknown as Repository<Email>,
    );
  });

  const optionsPassedToAgent = (): AskAiAgentOptions =>
    agent.ask.mock.calls[0][0];

  it("feeds the entire thread (not just the opened message) to the agent", async () => {
    // Opened row is a near-empty reaction; the substance is in a sibling.
    emailRepo.findOne.mockResolvedValue(
      emailRow({ id: "reaction", body: "reacted via Gmail" }),
    );
    // Repository returns newest-first; controller reverses to oldest→newest.
    emailRepo.find.mockResolvedValue([
      emailRow({
        id: "reaction",
        body: "reacted via Gmail",
        receivedAt: new Date("2026-01-03"),
      }),
      emailRow({
        id: "substance",
        fromName: "Rachael Unwin",
        body: "Your abstract was accepted for an oral presentation. Camera-ready is due 1 March 2026.",
        receivedAt: new Date("2026-01-02"),
      }),
    ]);

    await controller.askEmail(req, {
      emailId: "reaction",
      question: "key dates?",
    });

    const opts = optionsPassedToAgent();
    expect(opts.email.isThread).toBe(true);
    expect(opts.email.body).toContain("abstract was accepted");
    expect(opts.email.body).toContain("1 March 2026");
    expect(opts.email.body).toContain("[Message 1 from Rachael Unwin");
    expect(emailRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", emailThreadId: "thread-1" },
      }),
    );
  });

  it("uses the single message body when the thread has only one email", async () => {
    emailRepo.findOne.mockResolvedValue(
      emailRow({ id: "only", body: "Just one standalone message." }),
    );
    emailRepo.find.mockResolvedValue([
      emailRow({ id: "only", body: "Just one standalone message." }),
    ]);

    await controller.askEmail(req, { emailId: "only", question: "q" });

    const opts = optionsPassedToAgent();
    expect(opts.email.isThread).toBe(false);
    expect(opts.email.body).toContain("Just one standalone message");
    expect(opts.email.body).not.toContain("[Message 1");
  });

  describe("tool approval stream", () => {
    const APPROVAL_ID = "11111111-1111-1111-1111-111111111111";
    const HASH = "b".repeat(64);

    function fakeStream() {
      const writes: string[] = [];
      const res = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((chunk: string) => writes.push(chunk)),
        end: jest.fn(),
        writableEnded: false,
      } as unknown as Response;
      const rawReq = { on: jest.fn() } as unknown as ExpressRequest;
      const events = () =>
        writes.map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
      return { res, rawReq, events };
    }

    it("rejects a malformed approval before claiming anything", async () => {
      const { res, rawReq } = fakeStream();

      await expect(
        controller.streamToolDecision(
          req,
          { approvalId: "not-a-uuid", argumentsHash: HASH, approved: true },
          rawReq,
          res,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        controller.streamToolDecision(
          req,
          { approvalId: APPROVAL_ID, argumentsHash: "short", approved: true },
          rawReq,
          res,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(agent.claimApproval).not.toHaveBeenCalled();
    });

    it("claims the approval for the signed-in user, then streams the resumed answer", async () => {
      const paused = { awaiting: {} } as never;
      agent.claimApproval.mockResolvedValue(paused);
      agent.resume.mockResolvedValue({ answer: "Done.", toolActivity: [] });
      const { res, rawReq, events } = fakeStream();

      await controller.streamToolDecision(
        req,
        { approvalId: APPROVAL_ID, argumentsHash: HASH, approved: false },
        rawReq,
        res,
      );

      const decision = {
        userId: "u1",
        approvalId: APPROVAL_ID,
        argumentsHash: HASH,
        approved: false,
      };
      expect(agent.claimApproval).toHaveBeenCalledWith(decision);
      expect(agent.resume).toHaveBeenCalledWith(
        decision,
        paused,
        expect.objectContaining({ onEvent: expect.any(Function) }),
      );
      expect(events()).toEqual([
        { type: "answer", answer: "Done.", toolActivity: [] },
      ]);
    });

    it("streams an approval_required event when the turn pauses", async () => {
      emailRepo.findOne.mockResolvedValue(emailRow({}));
      emailRepo.find.mockResolvedValue([]);
      const pendingToolCall = {
        approvalId: APPROVAL_ID,
        serverName: "Google Drive",
        toolName: "share_file",
        arguments: { fileId: "f1" },
        argumentsHash: HASH,
        expiresAt: new Date().toISOString(),
      };
      agent.ask.mockResolvedValue({
        answer: "",
        toolActivity: [],
        pendingToolCall,
      });
      const { res, rawReq, events } = fakeStream();

      await controller.streamEmail(
        req,
        { emailId: "e1", question: "share it" },
        rawReq,
        res,
      );

      expect(events()).toEqual([
        { type: "approval_required", pendingToolCall, toolActivity: [] },
      ]);
    });
  });
});
