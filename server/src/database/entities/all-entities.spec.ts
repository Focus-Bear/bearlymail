import { readdirSync } from "fs";
import { join } from "path";
import { getMetadataArgsStorage } from "typeorm";

import { ALL_ENTITIES } from "./all-entities";

describe("ALL_ENTITIES", () => {
  it("lists every @Entity class, so the Lambda's DataSource can start", async () => {
    // Load every entity module so each @Entity decorator registers itself.
    await Promise.all(
      readdirSync(__dirname)
        .filter((file) => file.endsWith(".entity.ts"))
        .map((file) => import(join(__dirname, file))),
    );
    const registered = new Set(
      getMetadataArgsStorage().tables.map((table) => table.target),
    );
    const listed = new Set<unknown>(ALL_ENTITIES);
    const unlisted = [...registered]
      .filter((target) => !listed.has(target))
      .map((target) => (target as { name?: string }).name ?? String(target));
    expect(unlisted).toEqual([]);
  });
});
