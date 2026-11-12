import { ACCESS_TOKEN_KINDS } from "../constants/personal-access-tokens.constants";
import { PersonalAccessToken } from "../database/entities/personal-access-token.entity";
import { InMemoryRepository } from "../test/helpers/in-memory-repository";
import { PersonalAccessTokensService } from "./personal-access-tokens.service";
import { revokeAllAccessTokens } from "./revoke-all-access-tokens";

describe("revokeAllAccessTokens", () => {
  const NOW = new Date("2026-11-13T00:00:00Z");

  it("ends every live personal token and OAuth connection of that user only", async () => {
    const repository = new InMemoryRepository<PersonalAccessToken>();
    const service = new PersonalAccessTokensService(repository.asRepository());
    const victim = await service.create("victim", {
      name: "attacker's token",
      scopes: ["mail:read", "mail:send"],
    });
    const other = await service.create("someone-else", {
      name: "unrelated",
      scopes: ["mail:read"],
    });
    await repository.asRepository().save(
      repository.asRepository().create({
        userId: "victim",
        kind: ACCESS_TOKEN_KINDS.OAUTH,
        name: "Claude",
        tokenHash: "oauth-hash",
        tokenPrefix: "bm_oat_",
        scopes: ["mail:read"],
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );

    await expect(
      revokeAllAccessTokens(repository.asRepository(), "victim", NOW),
    ).resolves.toBe(2);

    await expect(service.authenticate(victim.token)).resolves.toBeNull();
    await expect(service.authenticate(other.token)).resolves.not.toBeNull();
  });
});
