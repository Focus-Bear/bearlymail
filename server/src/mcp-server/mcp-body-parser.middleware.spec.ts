import { Body, Controller, INestApplication, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { MCP_SERVER } from "../constants/mcp-server.constants";
import { mcpJsonBodyParser } from "./mcp-body-parser.middleware";

const ECHO_ROUTE = "echo";
/** Above Nest's 100kb default JSON limit, below MCP_SERVER.MAX_REQUEST_BODY. */
const LARGE_PAYLOAD = { data: "x".repeat(2 * 1024 * 1024) };

@Controller()
class EchoController {
  @Post(MCP_SERVER.ROUTE)
  mcp(@Body() body: { data?: string }) {
    return { length: body.data?.length ?? 0 };
  }

  @Post(ECHO_ROUTE)
  echo(@Body() body: { data?: string }) {
    return { length: body.data?.length ?? 0 };
  }
}

describe("mcpJsonBodyParser", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EchoController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(`/${MCP_SERVER.ROUTE}`, mcpJsonBodyParser);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts large JSON bodies on /mcp", async () => {
    const response = await request(app.getHttpServer())
      .post(`/${MCP_SERVER.ROUTE}`)
      .send(LARGE_PAYLOAD);
    expect(response.status).toBe(201);
    expect(response.body.length).toBe(LARGE_PAYLOAD.data.length);
  });

  it("leaves Nest's own JSON parser in place for every other route", async () => {
    const small = await request(app.getHttpServer())
      .post(`/${ECHO_ROUTE}`)
      .send({ data: "hello" });
    expect(small.body.length).toBe("hello".length);

    const large = await request(app.getHttpServer())
      .post(`/${ECHO_ROUTE}`)
      .send(LARGE_PAYLOAD);
    expect(large.status).toBe(413);
  });
});
