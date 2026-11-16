import { HttpException, HttpStatus } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import {
  isEmail,
  isUUID,
  validateSync,
  ValidationError,
} from "class-validator";

import { MCP_SERVER } from "../constants/mcp-server.constants";

/**
 * A tool call the client got wrong. Reported back as a tool error (isError)
 * so the model can read the message and retry with fixed arguments.
 */
export class McpToolInputError extends Error {}

export type ToolArgs = Record<string, unknown>;

export function requiredString(
  args: ToolArgs,
  key: string,
  maxLength: number,
): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new McpToolInputError(
      `\`${key}\` is required and must be a non-empty string`,
    );
  }
  if (value.length > maxLength) {
    throw new McpToolInputError(
      `\`${key}\` must be at most ${maxLength} characters`,
    );
  }
  return value;
}

export function optionalInteger(
  args: ToolArgs,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new McpToolInputError(
      `\`${key}\` must be an integer from ${min} to ${max}`,
    );
  }
  return value;
}

export function optionalBoolean(
  args: ToolArgs,
  key: string,
): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new McpToolInputError(`\`${key}\` must be true or false`);
  }
  return value;
}

export function optionalEnum<T extends string>(
  args: ToolArgs,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    throw new McpToolInputError(
      `\`${key}\` must be one of: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

/** A list of bare email addresses; undefined when absent or empty. */
export function optionalEmailList(
  args: ToolArgs,
  key: string,
): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new McpToolInputError(
      `\`${key}\` must be an array of email addresses`,
    );
  }
  if (value.length > MCP_SERVER.MAX_RECIPIENTS) {
    throw new McpToolInputError(
      `\`${key}\` can have at most ${MCP_SERVER.MAX_RECIPIENTS} addresses`,
    );
  }
  const addresses = value.map((item) =>
    typeof item === "string" ? item.trim() : "",
  );
  const invalid = addresses.filter((address) => !isEmail(address));
  if (invalid.length) {
    throw new McpToolInputError(
      `\`${key}\` contains invalid email addresses: ${invalid.join(", ")}`,
    );
  }
  return addresses.length ? addresses : undefined;
}

/** A BearlyMail id (UUID) the caller must pass. */
export function requiredId(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !isUUID(value)) {
    throw new McpToolInputError(`\`${key}\` must be a BearlyMail id (UUID)`);
  }
  return value;
}

/** One or more distinct BearlyMail ids, at most `max`. */
export function requiredIdList(
  args: ToolArgs,
  key: string,
  max: number,
): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new McpToolInputError(
      `\`${key}\` must be an array of 1 to ${max} ids`,
    );
  }
  const invalid = value.filter(
    (item) => typeof item !== "string" || !isUUID(item),
  );
  if (invalid.length) {
    throw new McpToolInputError(
      `\`${key}\` contains values that aren't BearlyMail ids: ${invalid.join(", ")}`,
    );
  }
  return [...new Set(value as string[])];
}

/** A string that may be omitted; null counts as "clear it" and returns null. */
export function optionalNullableString(
  args: ToolArgs,
  key: string,
  maxLength: number,
): string | null | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new McpToolInputError(`\`${key}\` must be a string or null`);
  }
  if (value.length > maxLength) {
    throw new McpToolInputError(
      `\`${key}\` must be at most ${maxLength} characters`,
    );
  }
  return value;
}

export function optionalObject(
  args: ToolArgs,
  key: string,
): ToolArgs | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new McpToolInputError(`\`${key}\` must be an object`);
  }
  return value as ToolArgs;
}

/** Top-level messages already name their property; nested ones get a path. */
function validationMessages(
  errors: ValidationError[],
  parentPath = "",
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const prefix = parentPath ? `${path}: ` : "";
    const own = Object.values(error.constraints ?? {}).map(
      (message) => `${prefix}${message}`,
    );
    return [...own, ...validationMessages(error.children ?? [], path)];
  });
}

/**
 * Validates tool arguments against the same class-validator DTO (and the
 * same whitelist options as the global ValidationPipe) the web app's endpoint
 * uses, so an MCP write is held to exactly the rules a Settings save is.
 */
export function validateAsDto<T extends object>(
  dtoClass: new () => T,
  plain: ToolArgs,
): T {
  const instance = plainToInstance(dtoClass, plain);
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    throw new McpToolInputError(validationMessages(errors).join("; "));
  }
  return instance;
}

/**
 * Runs a call into a web-app service and reports its 4xx rejections (bad
 * category id, a rule that would match too broadly...) as tool input errors
 * the model can read, instead of the generic failure message.
 */
export async function withServiceRejectionsAsInputErrors<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (
      error instanceof HttpException &&
      error.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      throw new McpToolInputError(error.message);
    }
    throw error;
  }
}
