import { Repository } from "typeorm";

import { MCP_OAUTH } from "../constants/mcp-oauth.constants";
import { OAuthClient } from "../database/entities/oauth-client.entity";
import { OAuthClientRegistryService } from "./oauth-client-registry.service";

const REGISTRATION = {
  client_name: "Some client",
  redirect_uris: ["https://client.example/callback"],
};

function buildRegistry(query: jest.Mock) {
  const repository = {
    create: (row: Partial<OAuthClient>) => row,
    save: async (row: Partial<OAuthClient>) => ({
      ...row,
      createdAt: new Date(),
    }),
    query,
  };
  return new OAuthClientRegistryService(
    repository as unknown as Repository<OAuthClient>,
  );
}

describe("OAuthClientRegistryService unused client cleanup", () => {
  it("removes old clients that have no live connection", async () => {
    const query = jest.fn().mockResolvedValue([]);
    const before = Date.now();

    await buildRegistry(query).register(REGISTRATION);

    const [sql, [cutoff]] = query.mock.calls[0];
    expect(sql).toContain("DELETE FROM oauth_clients");
    expect(sql).toContain('token."revokedAt" IS NULL');
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      before - MCP_OAUTH.UNUSED_CLIENT_RETENTION_MS + 1000,
    );
  });

  it("still registers the client when the cleanup fails", async () => {
    const query = jest.fn().mockRejectedValue(new Error("database busy"));

    await expect(
      buildRegistry(query).register(REGISTRATION),
    ).resolves.toMatchObject({ client_name: "Some client" });
  });
});
