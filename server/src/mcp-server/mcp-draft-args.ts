import { isUUID } from "class-validator";

import { MCP_DRAFTS } from "../constants/mcp-server.constants";
import { QueuedAttachment } from "../database/entities/email-send-attempt.entity";
import {
  McpToolInputError,
  optionalEmailList,
  requiredString,
  ToolArgs,
} from "./mcp-tool-args";

const UUID_MAX_LENGTH = 36;
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BASE64_BLOCK_LENGTH = 4;
const MIME_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

const UNSAFE_FILENAME_PATTERN = /[\u0000-\u001f\u007f/\\]/;

function isPresent(args: ToolArgs, key: string): boolean {
  return args[key] !== undefined && args[key] !== null;
}

export function requiredUuid(args: ToolArgs, key: string): string {
  const value = requiredString(args, key, UUID_MAX_LENGTH);
  if (!isUUID(value)) {
    throw new McpToolInputError(`\`${key}\` must be a BearlyMail id`);
  }
  return value;
}

export function optionalUuid(args: ToolArgs, key: string): string | undefined {
  return isPresent(args, key) ? requiredUuid(args, key) : undefined;
}

/** Joins addresses the way reply_drafts stores them; null when there are none. */
export function joinAddresses(addresses: string[] | undefined): string | null {
  return addresses?.length ? addresses.join(", ") : null;
}

/**
 * A recipient list on update_draft: undefined leaves the field alone, and an
 * empty array clears it (optionalEmailList can't tell absent from empty).
 */
export function addressListChange(
  args: ToolArgs,
  key: string,
): string | null | undefined {
  if (!isPresent(args, key)) return undefined;
  return joinAddresses(optionalEmailList(args, key));
}

function decodedLength(base64: string): number {
  return Buffer.from(base64, "base64").length;
}

function parseBase64(value: unknown, index: number): string {
  const content = typeof value === "string" ? value.replace(/\s+/g, "") : "";
  if (
    !content ||
    content.length % BASE64_BLOCK_LENGTH !== 0 ||
    !BASE64_PATTERN.test(content)
  ) {
    throw new McpToolInputError(
      `\`attachments[${index}].contentBase64\` must be the file's bytes as standard base64`,
    );
  }
  return content;
}

function parseFilename(value: unknown, index: number): string {
  const filename = typeof value === "string" ? value.trim() : "";
  if (
    !filename ||
    filename.length > MCP_DRAFTS.MAX_FILENAME_LENGTH ||
    UNSAFE_FILENAME_PATTERN.test(filename)
  ) {
    throw new McpToolInputError(
      `\`attachments[${index}].filename\` must be a file name (no folders) of at most ${MCP_DRAFTS.MAX_FILENAME_LENGTH} characters`,
    );
  }
  return filename;
}

function parseMimeType(value: unknown, index: number): string {
  const mimeType = typeof value === "string" ? value.trim() : "";
  if (
    mimeType.length > MCP_DRAFTS.MAX_MIME_TYPE_LENGTH ||
    !MIME_TYPE_PATTERN.test(mimeType)
  ) {
    throw new McpToolInputError(
      `\`attachments[${index}].mimeType\` must be a MIME type such as application/pdf`,
    );
  }
  return mimeType;
}

function parseAttachment(item: unknown, index: number): QueuedAttachment {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new McpToolInputError(
      `\`attachments[${index}]\` must be an object with filename, mimeType and contentBase64`,
    );
  }
  const fields = item as Record<string, unknown>;
  return {
    filename: parseFilename(fields.filename, index),
    mimeType: parseMimeType(fields.mimeType, index),
    content: parseBase64(fields.contentBase64, index),
  };
}

function assertWithinSizeLimit(attachments: QueuedAttachment[]): void {
  const totalBytes = attachments.reduce(
    (sum, attachment) => sum + decodedLength(attachment.content),
    0,
  );
  if (totalBytes > MCP_DRAFTS.MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new McpToolInputError(
      `Attachments can total at most ${MCP_DRAFTS.MAX_ATTACHMENT_TOTAL_MB} MB per draft`,
    );
  }
}

/**
 * Draft attachments as the send queue stores them (base64 content). Returns
 * undefined when absent, and an empty list when the caller passed `[]` (which
 * update_draft treats as "remove all attachments").
 */
export function parseDraftAttachments(
  args: ToolArgs,
): QueuedAttachment[] | undefined {
  if (!isPresent(args, "attachments")) return undefined;
  const value = args.attachments;
  if (!Array.isArray(value)) {
    throw new McpToolInputError("`attachments` must be an array");
  }
  if (value.length > MCP_DRAFTS.MAX_ATTACHMENTS) {
    throw new McpToolInputError(
      `A draft can have at most ${MCP_DRAFTS.MAX_ATTACHMENTS} attachments`,
    );
  }
  const attachments = value.map(parseAttachment);
  assertWithinSizeLimit(attachments);
  return attachments;
}
