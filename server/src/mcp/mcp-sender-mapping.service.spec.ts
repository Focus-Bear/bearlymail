import { Repository } from "typeorm";

import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { LLMService } from "../llm/llm.service";
import { ALL_BIGIN_TOOLS } from "./bigin/__fixtures__/bigin.fixture";
import { MCPSenderMappingService } from "./mcp-sender-mapping.service";

const SERVER_ID = "server-1";
const USER_ID = "user-1";

describe("MCPSenderMappingService", () => {
  let configRepo: { findOne: jest.Mock; update: jest.Mock };
  let generateText: jest.Mock;
  let service: MCPSenderMappingService;

  beforeEach(() => {
    configRepo = { findOne: jest.fn(), update: jest.fn() };
    generateText = jest.fn();
    service = new MCPSenderMappingService(
      configRepo as unknown as Repository<MCPServerConfig>,
      { generateText } as unknown as LLMService,
    );
  });

  it("does not ask the LLM for a Zoho Bigin server — it has a fixed lookup", async () => {
    configRepo.findOne.mockResolvedValue({
      id: SERVER_ID,
      cachedTools: ALL_BIGIN_TOOLS,
    });

    await expect(service.deriveMapping(SERVER_ID, USER_ID)).resolves.toBeNull();

    expect(generateText).not.toHaveBeenCalled();
    expect(configRepo.update).toHaveBeenCalledWith(SERVER_ID, {
      senderLookupMapping: null,
    });
  });

  it("still derives a mapping once for other servers", async () => {
    configRepo.findOne.mockResolvedValue({
      id: SERVER_ID,
      cachedTools: [
        {
          name: "search_contacts",
          description: "Find a contact",
          inputSchema: { properties: { email: { type: "string" } } },
        },
      ],
    });
    generateText.mockResolvedValue(
      JSON.stringify({ toolName: "search_contacts", emailArgName: "email" }),
    );

    await expect(service.deriveMapping(SERVER_ID, USER_ID)).resolves.toEqual({
      toolName: "search_contacts",
      emailArgName: "email",
    });
    expect(generateText).toHaveBeenCalledTimes(1);
  });
});
