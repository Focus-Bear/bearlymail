import { extractMcpJson, isMcpToolError, isRecord } from "../mcp-tool-result";
import { BIGIN_RESPONSE_RECORDS_KEY } from "./bigin-sender-context.constants";

/** A Bigin tool call that the MCP server reported as failed (`isError`). */
export class BiginToolError extends Error {
  constructor(toolName: string) {
    super(`Bigin tool ${toolName} reported an error`);
    this.name = BiginToolError.name;
  }
}

function hasStringId(value: unknown): value is { id: string } {
  return isRecord(value) && typeof value.id === "string";
}

/**
 * Records from a Bigin list/search tool result. An empty or non-JSON result is
 * "no records" (Bigin answers a search miss with 204 No Content); a tool-level
 * error throws so the caller can tell a miss from a failure.
 */
export function readBiginRecords<TRecord extends { id: string }>(
  toolName: string,
  output: unknown,
): TRecord[] {
  if (isMcpToolError(output)) throw new BiginToolError(toolName);
  const payload = extractMcpJson(output);
  if (!isRecord(payload)) return [];
  const records = payload[BIGIN_RESPONSE_RECORDS_KEY];
  if (!Array.isArray(records)) return [];
  // Records are typed at this boundary: only the id is checked, every other
  // field is optional in the record types and read defensively.
  return records.filter(hasStringId) as TRecord[];
}
