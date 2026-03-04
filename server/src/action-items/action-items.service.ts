import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";

import { ActionItem } from "../database/entities/action-item.entity";

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItem)
    private actionItemRepository: Repository<ActionItem>,
  ) {}

  async create(
    userId: string,
    actionItemData: Partial<ActionItem>,
  ): Promise<ActionItem> {
    const item = this.actionItemRepository.create({
      ...actionItemData,
      userId,
    });
    return this.actionItemRepository.save(item);
  }

  async findAll(userId: string, emailId?: string): Promise<ActionItem[]> {
    const where: { userId: string; emailId?: string } = { userId };
    if (emailId) {
      where.emailId = emailId;
    }
    return this.actionItemRepository.find({
      where,
      order: { isCompleted: "ASC", createdAt: "DESC" },
    });
  }

  async findByThread(
    userId: string,
    emailThreadId: string,
  ): Promise<ActionItem[]> {
    return this.actionItemRepository.find({
      where: { userId, emailThreadId },
      order: { isCompleted: "ASC", createdAt: "DESC" },
    });
  }

  async findSuggestedActionsByThread(
    userId: string,
    emailThreadId: string,
  ): Promise<ActionItem[]> {
    return this.actionItemRepository.find({
      where: {
        userId,
        emailThreadId,
        actionType: Not(IsNull()),
      },
      order: { isCompleted: "ASC", createdAt: "DESC" },
    });
  }

  async invalidateLLMSuggestedActions(emailThreadId: string): Promise<void> {
    await this.actionItemRepository.delete({
      emailThreadId,
      source: "llm",
      actionType: Not(IsNull()),
    });
  }

  async update(
    userId: string,
    id: string,
    updateData: Partial<ActionItem>,
  ): Promise<ActionItem> {
    await this.actionItemRepository.update({ id, userId }, updateData);
    return this.actionItemRepository.findOne({ where: { id, userId } });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.actionItemRepository.delete({ id, userId });
  }
}
