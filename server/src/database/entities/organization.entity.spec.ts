import { getMetadataArgsStorage } from "typeorm";

import {
  ENCRYPTED_TRANSFORMER_SCOPE,
  getEncryptedTransformerMeta,
} from "../../encryption/encryption.helper";
import { Organization } from "./organization.entity";

/**
 * An organization is shared data: every member reads it, and the OAuth callback
 * provisions the personal org before any per-user key exists in ALS. Encrypting
 * it with whatever per-user key happens to be in scope produced rows that only
 * their writer could read (prod: recurring `organizations.name userKey=absent`
 * decrypt failures, 4 of 18 rows unreadable under the global key).
 */
describe("Organization entity encryption scope", () => {
  it("encrypts the name with the GLOBAL key, never a per-user key", () => {
    const column = getMetadataArgsStorage().columns.find(
      (col) => col.target === Organization && col.propertyName === "name",
    );

    expect(column).toBeDefined();
    expect(
      getEncryptedTransformerMeta(column!.options.transformer)?.scope,
    ).toBe(ENCRYPTED_TRANSFORMER_SCOPE.GLOBAL);
  });
});
