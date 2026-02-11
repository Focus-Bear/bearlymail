import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GitHubRepoMapping } from "../database/entities/github-repo-mapping.entity";

@Injectable()
export class GitHubRepoMappingService {
  private readonly logger = new Logger(GitHubRepoMappingService.name);

  constructor(
    @InjectRepository(GitHubRepoMapping)
    private readonly repoMappingRepository: Repository<GitHubRepoMapping>,
  ) {}

  async findAllForUser(userId: string): Promise<GitHubRepoMapping[]> {
    return this.repoMappingRepository.find({
      where: { userId },
      order: { isDefault: "DESC", updatedAt: "DESC" },
    });
  }

  async findOneForUser(
    userId: string,
    id: string,
  ): Promise<GitHubRepoMapping | null> {
    return this.repoMappingRepository.findOne({
      where: { id, userId },
    });
  }

  async create(
    userId: string,
    data: {
      owner: string;
      repo: string;
      emailCategories?: string;
      context?: string;
      isDefault?: boolean;
      isAutoDiscovered?: boolean;
    },
  ): Promise<GitHubRepoMapping> {
    if (data.isDefault) {
      await this.repoMappingRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const mapping = this.repoMappingRepository.create({
      userId,
      owner: data.owner,
      repo: data.repo,
      emailCategories: data.emailCategories || null,
      context: data.context || null,
      isDefault: data.isDefault || false,
      isAutoDiscovered: data.isAutoDiscovered || false,
    });

    return this.repoMappingRepository.save(mapping);
  }

  async update(
    userId: string,
    id: string,
    data: {
      emailCategories?: string;
      context?: string;
      isDefault?: boolean;
    },
  ): Promise<GitHubRepoMapping | null> {
    const mapping = await this.repoMappingRepository.findOne({
      where: { id, userId },
    });

    if (!mapping) {
      return null;
    }

    if (data.isDefault) {
      await this.repoMappingRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    if (data.emailCategories !== undefined) {
      mapping.emailCategories = data.emailCategories || null;
    }
    if (data.context !== undefined) {
      mapping.context = data.context || null;
    }
    if (data.isDefault !== undefined) {
      mapping.isDefault = data.isDefault;
    }

    return this.repoMappingRepository.save(mapping);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.repoMappingRepository.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  async getDefaultForUser(userId: string): Promise<GitHubRepoMapping | null> {
    return this.repoMappingRepository.findOne({
      where: { userId, isDefault: true },
    });
  }

  async findByCategory(
    userId: string,
    category: string,
  ): Promise<GitHubRepoMapping | null> {
    const mappings = await this.repoMappingRepository.find({
      where: { userId },
    });

    for (const mapping of mappings) {
      if (!mapping.emailCategories) continue;
      const categories = mapping.emailCategories
        .split(",")
        .map((c) => c.trim().toLowerCase());
      if (categories.includes(category.toLowerCase())) {
        return mapping;
      }
    }

    return null;
  }

  async getRepoForEmail(
    userId: string,
    emailCategory?: string | null,
  ): Promise<{ owner: string; repo: string } | null> {
    if (emailCategory) {
      const categoryMapping = await this.findByCategory(userId, emailCategory);
      if (categoryMapping) {
        return { owner: categoryMapping.owner, repo: categoryMapping.repo };
      }
    }

    const defaultMapping = await this.getDefaultForUser(userId);
    if (defaultMapping) {
      return { owner: defaultMapping.owner, repo: defaultMapping.repo };
    }

    return null;
  }

  async autoDiscoverRepo(
    userId: string,
    owner: string,
    repo: string,
    emailCategory?: string,
  ): Promise<GitHubRepoMapping | null> {
    const existing = await this.repoMappingRepository.findOne({
      where: { userId, owner, repo },
    });

    if (existing) {
      if (
        emailCategory &&
        existing.emailCategories &&
        !existing.emailCategories
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .includes(emailCategory.toLowerCase())
      ) {
        existing.emailCategories = `${existing.emailCategories},${emailCategory}`;
        return this.repoMappingRepository.save(existing);
      }

      if (emailCategory && !existing.emailCategories) {
        existing.emailCategories = emailCategory;
        return this.repoMappingRepository.save(existing);
      }

      return existing;
    }

    this.logger.log(
      `Auto-discovering GitHub repo ${owner}/${repo} for user ${userId}`,
    );

    const hasAny = await this.repoMappingRepository.count({
      where: { userId },
    });

    const mapping = this.repoMappingRepository.create({
      userId,
      owner,
      repo,
      emailCategories: emailCategory || null,
      isAutoDiscovered: true,
      isDefault: hasAny === 0,
    });

    return this.repoMappingRepository.save(mapping);
  }
}
