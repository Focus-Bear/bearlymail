/** MCP tools/call content-part discriminator for a plain-text part. */
const TEXT_CONTENT_TYPE = "text";

interface MCPContentPart {
  type?: unknown;
  text?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(part: unknown): string | null {
  if (!isRecord(part)) return null;
  const { type, text } = part as MCPContentPart;
  return type === TEXT_CONTENT_TYPE && typeof text === "string" ? text : null;
}

/**
 * Joined text parts of an MCP tools/call result (`{ content: [{ type: "text",
 * text }] }`), or "" when there are none.
 */
export function extractMcpText(output: unknown): string {
  if (typeof output === "string") return output;
  if (!isRecord(output) || !Array.isArray(output.content)) return "";
  return output.content
    .map(textOf)
    .filter((text): text is string => text !== null)
    .join("\n")
    .trim();
}

/** True when the server reported a tool-level failure (MCP `isError`). */
export function isMcpToolError(output: unknown): boolean {
  return isRecord(output) && output.isError === true;
}

/**
 * The tool's JSON payload: `structuredContent` when the server sends it,
 * otherwise its text content parsed as JSON. Null when neither is JSON.
 */
export function extractMcpJson(output: unknown): unknown {
  if (isRecord(output) && isRecord(output.structuredContent)) {
    return output.structuredContent;
  }
  const text = extractMcpText(output);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
