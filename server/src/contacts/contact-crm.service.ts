import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { Contact } from "../database/entities/contact.entity";
import {
  ContactCustomField,
  CustomFieldType,
} from "../database/entities/contact-custom-field.entity";
import { ContactCustomFieldValue } from "../database/entities/contact-custom-field-value.entity";
import { ContactNote } from "../database/entities/contact-note.entity";
import { ContactType } from "../database/entities/contact-type.entity";

const DEFAULT_CONTACT_TYPE_DEFS = [
  { name: "lead", label: "Lead", color: "#3B82F6", icon: "🎯", sortOrder: 0 },
  {
    name: "customer",
    label: "Customer",
    color: "#10B981",
    icon: "💰",
    sortOrder: 1,
  },
  {
    name: "team_member",
    label: "Team Member",
    color: "#8B5CF6",
    icon: "👥",
    sortOrder: 2,
  },
  {
    name: "advisor",
    label: "Advisor",
    color: "#F59E0B",
    icon: "🧠",
    sortOrder: 3,
  },
  {
    name: "stranger",
    label: "Stranger",
    color: "#6B7280",
    icon: "❓",
    sortOrder: 4,
  },
  { name: "bot", label: "Bot", color: "#9CA3AF", icon: "🤖", sortOrder: 5 },
  {
    name: "partner",
    label: "Partner",
    color: "#EC4899",
    icon: "🤝",
    sortOrder: 6,
  },
  {
    name: "spammer",
    label: "Spammer",
    color: "#EF4444",
    icon: "🚫",
    sortOrder: 7,
  },
];

export interface ContactNoteResult {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactCustomFieldResult {
  fieldId: string;
  fieldName: string;
  fieldType: string;
  value: string | null;
  options?: string[];
}

export interface ContactTypeResult {
  id: string;
  name: string;
  label: string;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
}

@Injectable()
export class ContactCrmService {
  private readonly logger = new Logger(ContactCrmService.name);

  constructor(
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(ContactNote)
    private contactNoteRepository: Repository<ContactNote>,
    @InjectRepository(ContactCustomField)
    private customFieldRepository: Repository<ContactCustomField>,
    @InjectRepository(ContactCustomFieldValue)
    private customFieldValueRepository: Repository<ContactCustomFieldValue>,
    @InjectRepository(ContactType)
    private contactTypeRepository: Repository<ContactType>,
  ) {}

  // ─── Contact Notes ─────────────────────────────────────────────────

  async addContactNote(
    userId: string,
    contactId: string,
    content: string,
  ): Promise<ContactNoteResult> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    const note = await this.contactNoteRepository.save({
      contactId,
      content,
    });

    return {
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  async updateContactNote(
    userId: string,
    contactId: string,
    noteId: string,
    content: string,
  ): Promise<ContactNoteResult> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    const note = await this.contactNoteRepository.findOne({
      where: { id: noteId, contactId },
    });
    if (!note) throw new NotFoundException("Note not found");

    note.content = content;
    const saved = await this.contactNoteRepository.save(note);
    return {
      id: saved.id,
      content: saved.content,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async deleteContactNote(
    userId: string,
    contactId: string,
    noteId: string,
  ): Promise<void> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    await this.contactNoteRepository.delete({ id: noteId, contactId });
  }

  async getContactNotes(contactId: string): Promise<ContactNoteResult[]> {
    const notes = await this.contactNoteRepository.find({
      where: { contactId },
      order: { createdAt: "DESC" },
    });
    return notes.map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }));
  }

  // ─── Contact Types ─────────────────────────────────────────────────

  async ensureDefaultContactTypes(userId: string): Promise<ContactType[]> {
    const existing = await this.contactTypeRepository.find({
      where: { userId },
      order: { sortOrder: "ASC" },
    });

    if (existing.length > 0) return existing;

    const types: ContactType[] = [];
    for (const def of DEFAULT_CONTACT_TYPE_DEFS) {
      const ct = await this.contactTypeRepository.save({
        userId,
        name: def.name,
        label: def.label,
        color: def.color,
        icon: def.icon,
        sortOrder: def.sortOrder,
        isDefault: true,
      });
      types.push(ct);
    }
    return types;
  }

  async getContactTypes(userId: string): Promise<ContactTypeResult[]> {
    const types = await this.ensureDefaultContactTypes(userId);
    return types.map((item) => ({
      id: item.id,
      name: item.name,
      label: item.label,
      color: item.color,
      icon: item.icon,
      sortOrder: item.sortOrder,
      isDefault: item.isDefault,
    }));
  }

  async createContactType(
    userId: string,
    input: { name: string; label: string; color?: string; icon?: string },
  ): Promise<ContactTypeResult> {
    await this.ensureDefaultContactTypes(userId);

    const slug = input.name
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (!slug) throw new BadRequestException("Invalid contact type name");

    const maxOrder = await this.contactTypeRepository
      .createQueryBuilder("ct")
      .where("ct.userId = :userId", { userId })
      .select("MAX(ct.sortOrder)", "max")
      .getRawOne();

    const ct = await this.contactTypeRepository.save({
      userId,
      name: slug,
      label: input.label,
      color: input.color || "#6B7280",
      icon: input.icon || null,
      sortOrder: (maxOrder?.max || 0) + 1,
      isDefault: false,
    });

    return {
      id: ct.id,
      name: ct.name,
      label: ct.label,
      color: ct.color,
      icon: ct.icon,
      sortOrder: ct.sortOrder,
      isDefault: ct.isDefault,
    };
  }

  async updateContactType(
    userId: string,
    typeId: string,
    input: { label?: string; color?: string; icon?: string },
  ): Promise<ContactTypeResult> {
    const ct = await this.contactTypeRepository.findOne({
      where: { id: typeId, userId },
    });
    if (!ct) throw new NotFoundException("Contact type not found");

    if (input.label !== undefined) ct.label = input.label;
    if (input.color !== undefined) ct.color = input.color;
    if (input.icon !== undefined) ct.icon = input.icon;

    const saved = await this.contactTypeRepository.save(ct);
    return {
      id: saved.id,
      name: saved.name,
      label: saved.label,
      color: saved.color,
      icon: saved.icon,
      sortOrder: saved.sortOrder,
      isDefault: saved.isDefault,
    };
  }

  async deleteContactType(userId: string, typeId: string): Promise<void> {
    const ct = await this.contactTypeRepository.findOne({
      where: { id: typeId, userId },
    });
    if (!ct) throw new NotFoundException("Contact type not found");
    await this.contactTypeRepository.remove(ct);
  }

  // ─── Custom Fields ─────────────────────────────────────────────────

  async getCustomFieldDefinitions(
    userId: string,
  ): Promise<ContactCustomField[]> {
    return this.customFieldRepository.find({
      where: { userId },
      order: { sortOrder: "ASC" },
    });
  }

  async createCustomField(
    userId: string,
    input: {
      fieldName: string;
      fieldType?: string;
      options?: string[];
    },
  ): Promise<ContactCustomField> {
    if (!input.fieldName)
      throw new BadRequestException("Field name is required");

    const maxOrder = await this.customFieldRepository
      .createQueryBuilder("cf")
      .where("cf.userId = :userId", { userId })
      .select("MAX(cf.sortOrder)", "max")
      .getRawOne();

    const fieldType = (input.fieldType || "text") as CustomFieldType;
    return this.customFieldRepository.save({
      userId,
      fieldName: input.fieldName,
      fieldType,
      options: input.options ? JSON.stringify(input.options) : null,
      sortOrder: (maxOrder?.max || 0) + 1,
    });
  }

  async updateCustomField(
    userId: string,
    fieldId: string,
    input: {
      fieldName?: string;
      fieldType?: string;
      options?: string[];
    },
  ): Promise<ContactCustomField> {
    const field = await this.customFieldRepository.findOne({
      where: { id: fieldId, userId },
    });
    if (!field)
      throw new NotFoundException(ERROR_MESSAGES.CUSTOM_FIELD_NOT_FOUND);

    if (input.fieldName !== undefined) field.fieldName = input.fieldName;
    if (input.fieldType !== undefined)
      field.fieldType = input.fieldType as CustomFieldType;
    if (input.options !== undefined)
      field.options = JSON.stringify(input.options);

    return this.customFieldRepository.save(field);
  }

  async deleteCustomField(userId: string, fieldId: string): Promise<void> {
    const field = await this.customFieldRepository.findOne({
      where: { id: fieldId, userId },
    });
    if (!field)
      throw new NotFoundException(ERROR_MESSAGES.CUSTOM_FIELD_NOT_FOUND);
    await this.customFieldRepository.remove(field);
  }

  async setCustomFieldValue(
    userId: string,
    contactId: string,
    fieldId: string,
    value: string,
  ): Promise<void> {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, userId },
    });
    if (!contact) throw new NotFoundException(ERROR_MESSAGES.CONTACT_NOT_FOUND);

    const field = await this.customFieldRepository.findOne({
      where: { id: fieldId, userId },
    });
    if (!field)
      throw new NotFoundException(ERROR_MESSAGES.CUSTOM_FIELD_NOT_FOUND);

    const existing = await this.customFieldValueRepository.findOne({
      where: { contactId, fieldId },
    });

    if (existing) {
      existing.value = value;
      await this.customFieldValueRepository.save(existing);
    } else {
      await this.customFieldValueRepository.save({
        contactId,
        fieldId,
        value,
      });
    }
  }

  async getContactCustomFields(
    userId: string,
    contactId: string,
  ): Promise<ContactCustomFieldResult[]> {
    const fields = await this.customFieldRepository.find({
      where: { userId },
      order: { sortOrder: "ASC" },
    });

    const values = await this.customFieldValueRepository.find({
      where: { contactId },
    });

    const valueMap = new Map(
      values.map((value) => [value.fieldId, value.value]),
    );

    return fields.map((field) => ({
      fieldId: field.id,
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      value: valueMap.get(field.id) || null,
      options: field.options ? JSON.parse(field.options) : undefined,
    }));
  }
}
