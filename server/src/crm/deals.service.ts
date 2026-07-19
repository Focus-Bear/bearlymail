import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Contact } from "../database/entities/contact.entity";
import { Deal } from "../database/entities/deal.entity";
import {
  DealStage,
  DEFAULT_DEAL_STAGES,
} from "../database/entities/deal-stage.entity";

// Upper bound on stages processed per reorder request so a maliciously large
// client-supplied array can't drive an unbounded number of DB writes (CWE-834).
const MAX_STAGE_REORDER_COUNT = 100;

export interface DealResponse {
  id: string;
  title: string;
  details: string | null;
  value: number | null;
  currency: string | null;
  expectedCloseDate: string | null;
  stageId: string | null;
  stageName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DealStageResponse {
  id: string;
  name: string;
  sortOrder: number;
  color: string | null;
  isWon: boolean;
  isLost: boolean;
}

export interface KanbanBoard {
  stages: DealStageResponse[];
  deals: Record<string, DealResponse[]>;
  totals: Record<string, number>;
}

const DEFAULT_STAGE_COLORS: Record<string, string> = {
  Prospect: "#6B7280",
  Qualified: "#3B82F6",
  Proposal: "#8B5CF6",
  Negotiation: "#F59E0B",
  "Closed Won": "#10B981",
  "Closed Lost": "#EF4444",
};

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    @InjectRepository(Deal) private dealRepository: Repository<Deal>,
    @InjectRepository(DealStage)
    private dealStageRepository: Repository<DealStage>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
  ) {}

  private async verifyContactOwnership(
    userId: string,
    contactId: string,
  ): Promise<void> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
      select: {
        id: true,
      },
    });
    if (!contact) {
      throw new ForbiddenException(
        "Contact not found or does not belong to this user",
      );
    }
  }

  private async verifyStageOwnership(
    userId: string,
    stageId: string,
  ): Promise<void> {
    const stage = await this.dealStageRepository.findOne({
      where: { id: stageId, userId },
      select: {
        id: true,
      },
    });
    if (!stage) {
      throw new ForbiddenException(
        "Stage not found or does not belong to this user",
      );
    }
  }

  async ensureDefaultStages(userId: string): Promise<DealStage[]> {
    const existing = await this.dealStageRepository.find({
      where: { userId },
      order: { sortOrder: "ASC" },
    });

    if (existing.length > 0) return existing;

    const stages: DealStage[] = [];
    for (const def of DEFAULT_DEAL_STAGES) {
      const stage = await this.dealStageRepository.save({
        userId,
        name: def.name,
        sortOrder: def.sortOrder,
        color: DEFAULT_STAGE_COLORS[def.name] || null,
        isWon: def.name === "Closed Won",
        isLost: def.name === "Closed Lost",
      });
      stages.push(stage);
    }
    return stages;
  }

  async getStages(userId: string): Promise<DealStageResponse[]> {
    const stages = await this.ensureDefaultStages(userId);
    return stages.map((segment) => ({
      id: segment.id,
      name: segment.name,
      sortOrder: segment.sortOrder,
      color: segment.color,
      isWon: segment.isWon,
      isLost: segment.isLost,
    }));
  }

  async createStage(
    userId: string,
    input: {
      name: string;
      color?: string;
      isWon?: boolean;
      isLost?: boolean;
    },
  ): Promise<DealStageResponse> {
    await this.ensureDefaultStages(userId);

    const maxOrder = await this.dealStageRepository
      .createQueryBuilder("stage")
      .where("stage.userId = :userId", { userId })
      .select("MAX(stage.sortOrder)", "max")
      .getRawOne();

    const stage = await this.dealStageRepository.save({
      userId,
      name: input.name,
      sortOrder: (maxOrder?.max || 0) + 1,
      color: input.color || null,
      isWon: input.isWon || false,
      isLost: input.isLost || false,
    });

    return {
      id: stage.id,
      name: stage.name,
      sortOrder: stage.sortOrder,
      color: stage.color,
      isWon: stage.isWon,
      isLost: stage.isLost,
    };
  }

  async updateStage(
    userId: string,
    stageId: string,
    input: {
      name?: string;
      color?: string;
      sortOrder?: number;
      isWon?: boolean;
      isLost?: boolean;
    },
  ): Promise<DealStageResponse> {
    const stage = await this.dealStageRepository.findOne({
      where: { id: stageId, userId },
    });
    if (!stage) throw new NotFoundException("Stage not found");

    if (input.name !== undefined) stage.name = input.name;
    if (input.color !== undefined) stage.color = input.color;
    if (input.sortOrder !== undefined) stage.sortOrder = input.sortOrder;
    if (input.isWon !== undefined) stage.isWon = input.isWon;
    if (input.isLost !== undefined) stage.isLost = input.isLost;

    const saved = await this.dealStageRepository.save(stage);
    return {
      id: saved.id,
      name: saved.name,
      sortOrder: saved.sortOrder,
      color: saved.color,
      isWon: saved.isWon,
      isLost: saved.isLost,
    };
  }

  async deleteStage(userId: string, stageId: string): Promise<void> {
    const stage = await this.dealStageRepository.findOne({
      where: { id: stageId, userId },
    });
    if (!stage) throw new NotFoundException("Stage not found");

    await this.dealStageRepository.remove(stage);
  }

  async reorderStages(
    userId: string,
    stageIds: string[],
  ): Promise<DealStageResponse[]> {
    const count = Math.min(stageIds.length, MAX_STAGE_REORDER_COUNT);
    for (let i = 0; i < count; i++) {
      await this.dealStageRepository.update(
        { id: stageIds[i], userId },
        { sortOrder: i },
      );
    }
    return this.getStages(userId);
  }

  async getDeals(userId: string): Promise<DealResponse[]> {
    const deals = await this.dealRepository.find({
      where: { userId },
      relations: {
        stage: true,
        contact: true,
      },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    });

    return deals.map((deal) => this.toDealResponse(deal));
  }

  async getDeal(userId: string, dealId: string): Promise<DealResponse> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId, userId },
      relations: {
        stage: true,
        contact: true,
      },
    });
    if (!deal) throw new NotFoundException(ERROR_MESSAGES.DEAL_NOT_FOUND);
    return this.toDealResponse(deal);
  }

  async createDeal(
    userId: string,
    input: {
      title: string;
      details?: string;
      value?: number;
      currency?: string;
      stageId?: string;
      contactId?: string;
      expectedCloseDate?: string;
    },
  ): Promise<DealResponse> {
    const stages = await this.ensureDefaultStages(userId);
    let { stageId } = input;
    if (!stageId && stages.length > 0) {
      stageId = stages[0].id;
    }

    if (!input.title) {
      throw new BadRequestException("Deal title is required");
    }

    if (input.contactId) {
      await this.verifyContactOwnership(userId, input.contactId);
    }
    if (stageId) {
      await this.verifyStageOwnership(userId, stageId);
    }

    const deal = await this.dealRepository.save({
      userId,
      title: input.title,
      details: input.details || null,
      value: input.value ?? null,
      currency: input.currency || "USD",
      stageId: stageId || null,
      contactId: input.contactId || null,
      expectedCloseDate: input.expectedCloseDate
        ? new Date(input.expectedCloseDate)
        : null,
    });

    return this.getDeal(userId, deal.id);
  }

  async updateDeal(
    userId: string,
    dealId: string,
    input: {
      title?: string;
      details?: string;
      value?: number;
      currency?: string;
      stageId?: string;
      contactId?: string;
      expectedCloseDate?: string;
      sortOrder?: number;
    },
  ): Promise<DealResponse> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId, userId },
    });
    if (!deal) throw new NotFoundException(ERROR_MESSAGES.DEAL_NOT_FOUND);

    if (input.contactId) {
      await this.verifyContactOwnership(userId, input.contactId);
    }
    if (input.stageId) {
      await this.verifyStageOwnership(userId, input.stageId);
    }

    if (input.title !== undefined) deal.title = input.title;
    if (input.details !== undefined) deal.details = input.details;
    if (input.value !== undefined) deal.value = input.value;
    if (input.currency !== undefined) deal.currency = input.currency;
    if (input.stageId !== undefined) deal.stageId = input.stageId;
    if (input.contactId !== undefined) deal.contactId = input.contactId;
    if (input.expectedCloseDate !== undefined) {
      deal.expectedCloseDate = input.expectedCloseDate
        ? new Date(input.expectedCloseDate)
        : null;
    }
    if (input.sortOrder !== undefined) deal.sortOrder = input.sortOrder;

    await this.dealRepository.save(deal);
    return this.getDeal(userId, dealId);
  }

  async deleteDeal(userId: string, dealId: string): Promise<void> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId, userId },
    });
    if (!deal) throw new NotFoundException(ERROR_MESSAGES.DEAL_NOT_FOUND);
    await this.dealRepository.remove(deal);
  }

  async moveDeal(
    userId: string,
    dealId: string,
    stageId: string,
    sortOrder?: number,
  ): Promise<DealResponse> {
    return this.updateDeal(userId, dealId, {
      stageId,
      sortOrder: sortOrder ?? 0,
    });
  }

  async getKanbanBoard(userId: string): Promise<KanbanBoard> {
    const stages = await this.getStages(userId);
    const deals = await this.getDeals(userId);

    const grouped: Record<string, DealResponse[]> = {};
    const totals: Record<string, number> = {};

    for (const stage of stages) {
      grouped[stage.id] = [];
      totals[stage.id] = 0;
    }

    const ungroupedKey = "ungrouped";
    grouped[ungroupedKey] = [];
    totals[ungroupedKey] = 0;

    for (const deal of deals) {
      const key =
        deal.stageId && grouped[deal.stageId] ? deal.stageId : ungroupedKey;
      grouped[key].push(deal);
      totals[key] += deal.value ? Number(deal.value) : 0;
    }

    if (grouped[ungroupedKey].length === 0) {
      delete grouped[ungroupedKey];
      delete totals[ungroupedKey];
    }

    return { stages, deals: grouped, totals };
  }

  private toDealResponse(deal: Deal): DealResponse {
    return {
      id: deal.id,
      title: deal.title,
      details: deal.details,
      value: deal.value ? Number(deal.value) : null,
      currency: deal.currency,
      expectedCloseDate: deal.expectedCloseDate
        ? deal.expectedCloseDate.toISOString()
        : null,
      stageId: deal.stageId,
      stageName: deal.stage?.name || null,
      contactId: deal.contactId,
      contactName: deal.contact?.name || null,
      contactEmail: deal.contact?.email || null,
      sortOrder: deal.sortOrder,
      createdAt: deal.createdAt.toISOString(),
      updatedAt: deal.updatedAt.toISOString(),
    };
  }

  /**
   * Get deals associated with a specific contact.
   * Used for showing deals in email split view when viewing emails from a contact.
   */
  async getDealsForContact(
    userId: string,
    contactId: string,
  ): Promise<DealResponse[]> {
    const deals = await this.dealRepository.find({
      where: { userId, contactId },
      relations: {
        stage: true,
        contact: true,
      },
      order: { sortOrder: "ASC", createdAt: "DESC" },
    });

    return deals.map((deal) => this.toDealResponse(deal));
  }

  /**
   * Get deals associated with a contact by email address.
   * Used for showing deals in email split view when we only know the sender email.
   */
  async getDealsForContactByEmail(
    userId: string,
    email: string,
  ): Promise<DealResponse[]> {
    // First find the contact by email hash
    const { SearchIndexHelper } =
      await import("../contacts/search-index.helper");
    const emailHash = SearchIndexHelper.hashExact(email);

    const contact = await this.contactRepository.findOne({
      where: { userId, emailHash },
      select: {
        id: true,
      },
    });

    if (!contact) {
      return [];
    }

    return this.getDealsForContact(userId, contact.id);
  }
}
