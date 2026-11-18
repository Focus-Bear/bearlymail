import { BIGIN_TOOLS } from "./bigin-sender-context.constants";

export type ToolList = ReadonlyArray<{ name: string }> | null | undefined;

export const hasTool = (tools: ToolList, toolName: string): boolean =>
  (tools ?? []).some((tool) => tool.name === toolName);

/**
 * Whether a server is Zoho Bigin's MCP server, so the fixed lookup applies.
 * Only search is required: users pick which tools their Zoho MCP server
 * exposes, and deals/notes are skipped when their tools aren't there.
 */
export function isBiginToolset(tools: ToolList): boolean {
  return hasTool(tools, BIGIN_TOOLS.SEARCH_RECORDS);
}
