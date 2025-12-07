import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItem } from '../database/entities/action-item.entity';

@Injectable()
export class ActionItemsService {
  constructor(
    @InjectRepository(ActionItem)
    private actionItemRepository: Repository<ActionItem>,
  ) {}

  async create(userId: string, data: Partial<ActionItem>): Promise<ActionItem> {
    const item = this.actionItemRepository.create({ ...data, userId });
    return this.actionItemRepository.save(item);
  }

  async findAll(userId: string, emailId?: string): Promise<ActionItem[]> {
    const where: any = { userId };
    if (emailId) {
      where.emailId = emailId;
    }
    return this.actionItemRepository.find({
      where,
      order: { isCompleted: 'ASC', createdAt: 'DESC' },
    });
  }

  async update(userId: string, id: string, data: Partial<ActionItem>): Promise<ActionItem> {
    await this.actionItemRepository.update({ id, userId }, data);
    return this.actionItemRepository.findOne({ where: { id, userId } });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.actionItemRepository.delete({ id, userId });
  }
}



