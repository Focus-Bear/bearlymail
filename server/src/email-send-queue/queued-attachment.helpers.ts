import {
  QueuedAttachment,
  QueuedInlineImage,
} from "../database/entities/email-send-attempt.entity";

/** An attachment as it arrives from Multer / the provider layer. */
export interface BinaryAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/** An inline image as it arrives from Multer / the provider layer. */
export interface BinaryInlineImage extends BinaryAttachment {
  contentId: string;
}

/**
 * Attachment Buffers can't survive a JSON round-trip through the queue, so they
 * are base64-encoded into the persisted payload on the way in and decoded back
 * to Buffers in the worker.
 */
export function encodeAttachments(
  attachments?: BinaryAttachment[],
): QueuedAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    content: attachment.content.toString("base64"),
  }));
}

export function encodeInlineImages(
  inlineImages?: BinaryInlineImage[],
): QueuedInlineImage[] | undefined {
  if (!inlineImages?.length) return undefined;
  return inlineImages.map((image) => ({
    contentId: image.contentId,
    filename: image.filename,
    mimeType: image.mimeType,
    content: image.content.toString("base64"),
  }));
}

export function decodeAttachments(
  attachments?: QueuedAttachment[],
): BinaryAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    content: Buffer.from(attachment.content, "base64"),
  }));
}

export function decodeInlineImages(
  inlineImages?: QueuedInlineImage[],
): BinaryInlineImage[] | undefined {
  if (!inlineImages?.length) return undefined;
  return inlineImages.map((image) => ({
    contentId: image.contentId,
    filename: image.filename,
    mimeType: image.mimeType,
    content: Buffer.from(image.content, "base64"),
  }));
}
