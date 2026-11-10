import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Repository } from "typeorm";

import {
  USER_AI_KEY_LIMITS,
  USER_AI_PROVIDER_DESCRIPTORS,
  type UserAiProvider,
  type UserAiProviderDescriptor,
} from "../constants/user-ai-providers.constants";
import { User } from "../database/entities/user.entity";
import type { UserAiKeys } from "./user-ai-routing";

/** What Settings shows for one provider: never the key itself. */
export interface UserAiKeyStatus {
  provider: UserAiProvider;
  hasKey: boolean;
  /** e.g. "sk-ant-••••a1B2"; null when no key is saved. */
  maskedKey: string | null;
  /** ISO time the provider last rejected the key; null when it hasn't. */
  rejectedAt: string | null;
}

const KEY_COLUMNS = USER_AI_PROVIDER_DESCRIPTORS.map(
  (descriptor) => `user.${descriptor.column}`,
);

/**
 * Reads and writes the AI provider keys a user brings ("Use your own AI
 * account"). Keys live in global-key-encrypted `users` columns; they are only
 * decrypted here, for the server's own provider calls and for the masked
 * value Settings shows.
 */
@Injectable()
export class UserAiKeysService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findKeys(userId: string): Promise<UserAiKeys> {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .select(["user.id", ...KEY_COLUMNS])
      .where("user.id = :id", { id: userId })
      .getOne();
    return user ? toUserAiKeys(user) : {};
  }

  async findStatuses(userId: string): Promise<UserAiKeyStatus[]> {
    const user = await this.userRepository
      .createQueryBuilder("user")
      .select(["user.id", "user.aiKeyRejections", ...KEY_COLUMNS])
      .where("user.id = :id", { id: userId })
      .getOne();
    const rejections = user?.aiKeyRejections ?? {};
    return USER_AI_PROVIDER_DESCRIPTORS.map((descriptor) => {
      const key = user?.[descriptor.column] || null;
      return {
        provider: descriptor.id,
        hasKey: Boolean(key),
        maskedKey: key ? maskKey(key, descriptor) : null,
        rejectedAt: rejections[descriptor.id] ?? null,
      };
    });
  }

  /** Saves (or, with null, removes) a key and clears its rejection. */
  async setKey(
    userId: string,
    descriptor: UserAiProviderDescriptor,
    key: string | null,
  ): Promise<void> {
    // save() runs the column transformer, so the key is encrypted at rest.
    const change = {
      id: userId,
      [descriptor.column]: key,
    } as DeepPartial<User>;
    await this.userRepository.save(change);
    await this.userRepository.query(
      `UPDATE "users" SET "aiKeyRejections" = "aiKeyRejections" - $2 WHERE "id" = $1`,
      [userId, descriptor.id],
    );
  }

  /** Records that the provider refused the user's key, for Settings to show. */
  async markRejected(userId: string, provider: UserAiProvider): Promise<void> {
    await this.userRepository.query(
      `UPDATE "users"
         SET "aiKeyRejections" = COALESCE("aiKeyRejections", '{}'::jsonb) || jsonb_build_object($2::text, $3::text)
       WHERE "id" = $1`,
      [userId, provider, new Date().toISOString()],
    );
  }
}

function toUserAiKeys(user: User): UserAiKeys {
  const keys: UserAiKeys = {};
  for (const descriptor of USER_AI_PROVIDER_DESCRIPTORS) {
    const key = user[descriptor.column];
    if (key) keys[descriptor.id] = key;
  }
  return keys;
}

export function maskKey(
  key: string,
  descriptor: Pick<UserAiProviderDescriptor, "keyPrefix">,
): string {
  const suffix = key.slice(-USER_AI_KEY_LIMITS.MASK_VISIBLE_SUFFIX);
  return `${descriptor.keyPrefix ?? ""}${USER_AI_KEY_LIMITS.MASK_FILLER}${suffix}`;
}
