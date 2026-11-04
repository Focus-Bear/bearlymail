import { isEmail } from "class-validator";

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
