import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import { Contact } from "../database/entities/contact.entity";
import { ContactGroup } from "../database/entities/contact-group.entity";
import { ContactGroupMember } from "../database/entities/contact-group-member.entity";
import { CreateContactGroupDto } from "./dto/create-contact-group.dto";
import { UpdateContactGroupDto } from "./dto/update-contact-group.dto";

export interface ContactGroupMemberSummary {
  contactId: string;
  email: string;
  name?: string;
}

export interface ContactGroupResult {
  id: string;
  name: string;
  memberCount: number;
  members: ContactGroupMemberSummary[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ContactGroupsService {
  private readonly logger = new Logger(ContactGroupsService.name);

  constructor(
    @InjectRepository(ContactGroup)
    private groupRepo: Repository<ContactGroup>,
    @InjectRepository(ContactGroupMember)
    private memberRepo: Repository<ContactGroupMember>,
    @InjectRepository(Contact)
    private contactRepo: Repository<Contact>,
  ) {}

  private buildNameHash(name: string): string {
    return SearchIndexHelper.hashExact(name);
  }

  private async resolveMembers(
    groupId: string,
  ): Promise<ContactGroupMemberSummary[]> {
    const members = await this.memberRepo.find({
      where: { groupId },
      relations: {
        contact: true,
      },
    });
    return members.map((member) => ({
      contactId: member.contactId,
      email: member.contact?.email ?? "",
      name: member.contact?.name ?? undefined,
    }));
  }

  private toResult(
    group: ContactGroup,
    members: ContactGroupMemberSummary[],
  ): ContactGroupResult {
    return {
      id: group.id,
      name: group.name,
      memberCount: members.length,
      members,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  async listGroups(userId: string): Promise<ContactGroupResult[]> {
    const groups = await this.groupRepo.find({ where: { userId } });
    const results: ContactGroupResult[] = [];
    for (const group of groups) {
      const members = await this.resolveMembers(group.id);
      results.push(this.toResult(group, members));
    }
    return results;
  }

  async createGroup(
    userId: string,
    dto: CreateContactGroupDto,
  ): Promise<ContactGroupResult> {
    const group = this.groupRepo.create({
      userId,
      name: dto.name,
      nameHash: this.buildNameHash(dto.name),
    });
    await this.groupRepo.save(group);

    if (dto.memberContactIds?.length) {
      // Verify contacts belong to this user
      const contacts = await this.contactRepo.find({
        where: { userId, id: In(dto.memberContactIds) },
      });
      const contactIds = contacts.map((contact) => contact.id);
      const memberEntities = contactIds.map((contactId) =>
        this.memberRepo.create({ groupId: group.id, contactId }),
      );
      await this.memberRepo.save(memberEntities);
    }

    const members = await this.resolveMembers(group.id);
    return this.toResult(group, members);
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateContactGroupDto,
  ): Promise<ContactGroupResult> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException("Contact group not found");
    }
    if (group.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    if (dto.name !== undefined) {
      group.name = dto.name;
      group.nameHash = this.buildNameHash(dto.name);
    }
    await this.groupRepo.save(group);

    if (dto.memberContactIds !== undefined) {
      // Replace all members
      await this.memberRepo.delete({ groupId });
      if (dto.memberContactIds.length) {
        const contacts = await this.contactRepo.find({
          where: { userId, id: In(dto.memberContactIds) },
        });
        const contactIds = contacts.map((contact) => contact.id);
        const memberEntities = contactIds.map((contactId) =>
          this.memberRepo.create({ groupId: group.id, contactId }),
        );
        await this.memberRepo.save(memberEntities);
      }
    }

    const members = await this.resolveMembers(group.id);
    return this.toResult(group, members);
  }

  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException("Contact group not found");
    }
    if (group.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }
    await this.groupRepo.remove(group);
  }

  async searchGroups(
    userId: string,
    query: string,
  ): Promise<ContactGroupResult[]> {
    if (!query || query.length < 1) {
      return this.listGroups(userId);
    }

    // Load all groups for this user and filter by decrypted name (name is encrypted)
    // This is safe because the number of groups per user is expected to be small (< 1000).
    const groups = await this.groupRepo.find({ where: { userId } });
    const lowerQuery = query.toLowerCase();
    const matched = groups.filter((grp) =>
      grp.name?.toLowerCase().includes(lowerQuery),
    );

    const results: ContactGroupResult[] = [];
    for (const group of matched) {
      const members = await this.resolveMembers(group.id);
      results.push(this.toResult(group, members));
    }
    return results;
  }

  async getGroup(userId: string, groupId: string): Promise<ContactGroupResult> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException("Contact group not found");
    }
    if (group.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }
    const members = await this.resolveMembers(group.id);
    return this.toResult(group, members);
  }
}
