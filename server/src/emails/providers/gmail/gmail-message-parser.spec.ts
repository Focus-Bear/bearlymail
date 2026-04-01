import { gmail_v1 } from "googleapis";

import {
  extractAttachmentsFromPayload,
  filenameFromContentDisposition,
} from "./gmail-message-parser";

describe("gmail-message-parser — attachments", () => {
  describe("filenameFromContentDisposition", () => {
    it("parses quoted filename", () => {
      expect(
        filenameFromContentDisposition('attachment; filename="report.docx"'),
      ).toBe("report.docx");
    });

    it("parses RFC5987 filename*", () => {
      expect(
        filenameFromContentDisposition(
          "attachment; filename*=UTF-8''hello%20world.pdf",
        ),
      ).toBe("hello world.pdf");
    });
  });

  describe("extractAttachmentsFromPayload", () => {
    it("finds attachment when filename is only in Content-Disposition", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        partId: "",
        parts: [
          {
            mimeType: "text/plain",
            partId: "0",
            body: { data: "", size: 0 },
          },
          {
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename: "",
            partId: "1",
            headers: [
              {
                name: "Content-Disposition",
                value: 'attachment; filename="Proposal.docx"',
              },
            ],
            body: {
              attachmentId: "ANGjdJ_test_id",
              size: 50_000,
            },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result).toEqual([
        expect.objectContaining({
          attachmentId: "ANGjdJ_test_id",
          filename: "Proposal.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 50_000,
        }),
      ]);
    });

    it("still uses part.filename when Gmail sets it", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        partId: "",
        parts: [
          {
            mimeType: "application/pdf",
            filename: "deck.pdf",
            partId: "1",
            body: { attachmentId: "att_pdf", size: 1200 },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result?.[0].filename).toBe("deck.pdf");
    });

    it("skips inline image parts with Content-ID", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/related",
        partId: "",
        parts: [
          {
            mimeType: "image/png",
            filename: "",
            partId: "1",
            headers: [
              { name: "Content-ID", value: "<img001@local>" },
              { name: "Content-Disposition", value: "inline" },
            ],
            body: { attachmentId: "inline_att_id", size: 100 },
          },
        ],
      };
      expect(extractAttachmentsFromPayload(payload)).toBeUndefined();
    });

    it("uses fallback filename when attachmentId exists but no name headers", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        partId: "",
        parts: [
          {
            mimeType: "application/octet-stream",
            filename: "",
            partId: "1",
            body: { attachmentId: "orphan_id", size: 99 },
          },
        ],
      };
      const result = extractAttachmentsFromPayload(payload);
      expect(result?.[0].filename).toBe("attachment");
    });
  });
});
