import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { GitHubRepoMapping } from "../database/entities/github-repo-mapping.entity";
import { decryptGitHubRepoMappingEntityForApi } from "../encryption/entity-api-decrypt.util";
import { isGarbageEmailCategoryToken } from "../utils/github-email-categories.util";

@Injectable()
export class GitHubRepoMappingService {
  private readonly logger = new Logger(GitHubRepoMappingService.name);

  constructor(
    @InjectRepository(GitHubRepoMapping)
    private readonly repoMappingRepository: Repository<GitHubRepoMapping>,
  ) {}

  async findAllForUser(userId: string): Promise<GitHubRepoMapping[]> {
    // Fetch ordered so isDefault rows come first, then oldest first within each group.
    // This gives us a deterministic "winner" when deduplicating: the default mapping
    // wins over non-defaults, and among equals the oldest entry is kept.
    const all = await this.repoMappingRepository.find({
      where: { userId },
      order: { isDefault: "DESC", createdAt: "ASC" },
    });

    for (const repoMapping of all) {
      decryptGitHubRepoMappingEntityForApi(repoMapping);
    }

    // Deduplicate in-memory because owner/repo are encrypted with random IVs,
    // so DB-level UNIQUE constraints and WHERE-clause lookups on those columns
    // never match equivalent plaintext values (different ciphertext each time).
    const seen = new Map<string, GitHubRepoMapping>();
    const toDelete: string[] = [];

    for (const mapping of all) {
      const key = `${mapping.owner?.toLowerCase()}/${mapping.repo?.toLowerCase()}`;
      if (seen.has(key)) {
        toDelete.push(mapping.id);
      } else {
        seen.set(key, mapping);
      }
    }

    // Clean up duplicates asynchronously so we do not block the response.
    if (toDelete.length > 0) {
      this.logger.warn(
        `Found ${toDelete.length} duplicate repo mapping(s) for user ${userId}, cleaning up`,
      );
      this.repoMappingRepository
        .delete(toDelete)
        .catch((err) =>
          this.logger.error(
            `Failed to clean up duplicate repo mappings: ${err}`,
          ),
        );
    }

    // Return deduplicated results sorted by isDefault DESC, updatedAt DESC
    return Array.from(seen.values()).sort((itemA, itemB) => {
      if (itemA.isDefault && !itemB.isDefault) return -1;
      if (!itemA.isDefault && itemB.isDefault) return 1;
      return (
        new Date(itemB.updatedAt).getTime() -
        new Date(itemA.updatedAt).getTime()
      );
    });
  }

  async findOneForUser(
    userId: string,
    id: string,
  ): Promise<GitHubRepoMapping | null> {
    const mapping = await this.repoMappingRepository.findOne({
      where: { id, userId },
    });
    if (mapping) {
      decryptGitHubRepoMappingEntityForApi(mapping);
    }
    return mapping;
  }

  async create(
    userId: string,
    mappingData: {
      owner: string;
      repo: string;
      emailCategories?: string;
      context?: string;
      isDefault?: boolean;
      isAutoDiscovered?: boolean;
    },
  ): Promise<GitHubRepoMapping> {
    if (mappingData.isDefault) {
      await this.repoMappingRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const mapping = this.repoMappingRepository.create({
      userId,
      owner: mappingData.owner,
      repo: mappingData.repo,
      emailCategories: mappingData.emailCategories || null,
      context: mappingData.context || null,
      isDefault: mappingData.isDefault || false,
      isAutoDiscovered: mappingData.isAutoDiscovered || false,
    });

    const saved = await this.repoMappingRepository.save(mapping);
    decryptGitHubRepoMappingEntityForApi(saved);
    return saved;
  }

  async update(
    userId: string,
    id: string,
    updates: {
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

    if (updates.isDefault) {
      await this.repoMappingRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    if (updates.emailCategories !== undefined) {
      mapping.emailCategories = updates.emailCategories || null;
    }
    if (updates.context !== undefined) {
      mapping.context = updates.context || null;
    }
    if (updates.isDefault !== undefined) {
      mapping.isDefault = updates.isDefault;
    }

    const saved = await this.repoMappingRepository.save(mapping);
    decryptGitHubRepoMappingEntityForApi(saved);
    return saved;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.repoMappingRepository.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }

  async getDefaultForUser(userId: string): Promise<GitHubRepoMapping | null> {
    const mapping = await this.repoMappingRepository.findOne({
      where: { userId, isDefault: true },
    });
    if (mapping) {
      decryptGitHubRepoMappingEntityForApi(mapping);
    }
    return mapping;
  }

  async findByCategory(
    userId: string,
    category: string,
  ): Promise<GitHubRepoMapping | null> {
    const mappings = await this.repoMappingRepository.find({
      where: { userId },
    });

    for (const repoMapping of mappings) {
      decryptGitHubRepoMappingEntityForApi(repoMapping);
    }

    for (const mapping of mappings) {
      if (!mapping.emailCategories) continue;
      const categories = mapping.emailCategories
        .split(",")
        .map((category) => category.trim().toLowerCase());
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
    // We cannot query by owner/repo directly because those columns are encrypted
    // with a random IV on every write, so the same plaintext produces a different
    // ciphertext each time.  A WHERE clause on those columns would encrypt the
    // search value with a fresh IV that never matches any stored ciphertext.
    // Instead we fetch all mappings for the user and compare the decrypted values.
    const allMappings = await this.repoMappingRepository.find({
      where: { userId },
    });
    for (const repoMapping of allMappings) {
      decryptGitHubRepoMappingEntityForApi(repoMapping);
    }
    const existing =
      allMappings.find(
        (mapping) => mapping.owner === owner && mapping.repo === repo,
      ) ?? null;

    if (existing) {
      if (
        emailCategory &&
        !isGarbageEmailCategoryToken(emailCategory) &&
        existing.emailCategories &&
        !existing.emailCategories
          .split(",")
          .map((category) => category.trim().toLowerCase())
          .includes(emailCategory.toLowerCase())
      ) {
        existing.emailCategories = `${existing.emailCategories},${emailCategory}`;
        const saved = await this.repoMappingRepository.save(existing);
        decryptGitHubRepoMappingEntityForApi(saved);
        return saved;
      }

      if (
        emailCategory &&
        !isGarbageEmailCategoryToken(emailCategory) &&
        !existing.emailCategories
      ) {
        existing.emailCategories = emailCategory;
        const saved = await this.repoMappingRepository.save(existing);
        decryptGitHubRepoMappingEntityForApi(saved);
        return saved;
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
      emailCategories:
        emailCategory && !isGarbageEmailCategoryToken(emailCategory)
          ? emailCategory
          : null,
      isAutoDiscovered: true,
      isDefault: hasAny === 0,
    });

    const saved = await this.repoMappingRepository.save(mapping);
    decryptGitHubRepoMappingEntityForApi(saved);
    return saved;
  }
}
