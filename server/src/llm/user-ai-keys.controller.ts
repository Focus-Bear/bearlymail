import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  findUserAiProvider,
  type UserAiProviderDescriptor,
} from "../constants/user-ai-providers.constants";
import { validateUserAiKey } from "./user-ai-key-validator";
import {
  UserAiKeysService,
  type UserAiKeyStatus,
} from "./user-ai-keys.service";

interface AuthenticatedRequest {
  user: { userId: string };
}

/**
 * "Use your own AI account": save, replace and remove the user's own AI
 * provider keys. Responses only ever carry a masked key. Not behind
 * AiCapacityGuard — managing keys is not an AI call.
 */
@Controller("llm/me/ai-keys")
@UseGuards(JwtAuthGuard)
export class UserAiKeysController {
  constructor(private readonly userAiKeys: UserAiKeysService) {}

  @Get()
  async list(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ providers: UserAiKeyStatus[] }> {
    return { providers: await this.userAiKeys.findStatuses(req.user.userId) };
  }

  /** Validates the key with the provider, then stores it encrypted. */
  @Post(":provider")
  async save(
    @Request() req: AuthenticatedRequest,
    @Param("provider") providerId: string,
    @Body() body: { key?: unknown },
  ): Promise<{ providers: UserAiKeyStatus[] }> {
    const descriptor = requireProvider(providerId);
    const key = typeof body?.key === "string" ? body.key.trim() : "";
    const result = await validateUserAiKey(descriptor, key);
    if (!result.valid) {
      throw new BadRequestException(result.error ?? "Key validation failed");
    }
    await this.userAiKeys.setKey(req.user.userId, descriptor, key);
    return this.list(req);
  }

  @Delete(":provider")
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param("provider") providerId: string,
  ): Promise<{ providers: UserAiKeyStatus[] }> {
    await this.userAiKeys.setKey(
      req.user.userId,
      requireProvider(providerId),
      null,
    );
    return this.list(req);
  }
}

function requireProvider(providerId: string): UserAiProviderDescriptor {
  const descriptor = findUserAiProvider(providerId);
  if (!descriptor) throw new NotFoundException("Unknown AI provider");
  return descriptor;
}
