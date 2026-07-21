import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { SECONDS } from "../constants/time-constants";
import { ContactSearchResult, ContactsService } from "./contacts.service";

@Controller("contacts")
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  @Get("search")
  async searchContacts(
    @Request() req,
    @Query("q") query: string,
    @Query("limit") limit?: string,
  ): Promise<ContactSearchResult[]> {
    // A repeated query param (?q=a&q=b) arrives as an array; coerce to a single
    // string so downstream length checks and the blind-index hash can't be fed
    // an array (type confusion, CWE-843).
    const rawQuery = Array.isArray(query) ? query[0] : query;
    const searchQuery = typeof rawQuery === "string" ? rawQuery : "";
    const maxLimit = limit
      ? Math.min(parseInt(limit, 10), QUERY_LIMITS.CONTACTS_SEARCH_LIMIT)
      : QUERY_LIMITS.CONTACTS_PAGE_SIZE;
    return this.contactsService.searchContacts(
      req.user.userId,
      searchQuery,
      maxLimit,
    );
  }

  @Get("frequent")
  async getFrequentContacts(
    @Request() req,
    @Query("limit") limit?: string,
  ): Promise<ContactSearchResult[]> {
    const maxLimit = limit
      ? Math.min(parseInt(limit, 10), QUERY_LIMITS.CONTACTS_PAGE_SIZE)
      : 10;
    return this.contactsService.getFrequentContacts(req.user.userId, maxLimit);
  }

  @Get("types")
  async getContactTypes(@Request() req) {
    return this.contactsService.getContactTypes(req.user.userId);
  }

  @Post("types")
  async createContactType(
    @Request() req,
    @Body()
    body: { name: string; label: string; color?: string; icon?: string },
  ) {
    return this.contactsService.createContactType(req.user.userId, body);
  }

  @Put("types/:id")
  async updateContactType(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { label?: string; color?: string; icon?: string },
  ) {
    return this.contactsService.updateContactType(req.user.userId, id, body);
  }

  @Delete("types/:id")
  async deleteContactType(@Request() req, @Param("id") id: string) {
    await this.contactsService.deleteContactType(req.user.userId, id);
    return { success: true };
  }

  @Get("custom-fields")
  async getCustomFields(@Request() req) {
    return this.contactsService.getCustomFieldDefinitions(req.user.userId);
  }

  @Post("custom-fields")
  async createCustomField(
    @Request() req,
    @Body()
    body: { fieldName: string; fieldType?: string; options?: string[] },
  ) {
    return this.contactsService.createCustomField(req.user.userId, body);
  }

  @Put("custom-fields/:id")
  async updateCustomField(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: { fieldName?: string; fieldType?: string; options?: string[] },
  ) {
    return this.contactsService.updateCustomField(req.user.userId, id, body);
  }

  @Delete("custom-fields/:id")
  async deleteCustomField(@Request() req, @Param("id") id: string) {
    await this.contactsService.deleteCustomField(req.user.userId, id);
    return { success: true };
  }

  @Get("contact-types-by-emails")
  async getContactTypesByEmails(
    @Request() req,
    @Query("emails") emails: string,
  ) {
    const emailList = emails
      ? emails.split(",").map((emailEntry) => emailEntry.trim())
      : [];
    return this.contactsService.getContactTypesByEmails(
      req.user.userId,
      emailList,
    );
  }

  @Get(":id")
  async getContactDetail(@Request() req, @Param("id") id: string) {
    return this.contactsService.getContactDetail(req.user.userId, id);
  }

  /**
   * Return all email threads involving this contact (as sender, direct
   * recipient, or CC). Used by the contact detail page thread list.
   */
  @Get(":id/threads")
  async getContactThreads(@Request() req, @Param("id") id: string) {
    return this.contactsService.getContactThreads(req.user.userId, id);
  }

  @Put(":id")
  async updateContact(
    @Request() req,
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      jobTitle?: string;
      phone?: string;
      contactType?: string;
      followUpDate?: string | null;
    },
  ) {
    return this.contactsService.updateContact(req.user.userId, id, body);
  }

  @Post(":id/notes")
  async addNote(
    @Request() req,
    @Param("id") id: string,
    @Body() body: { content: string },
  ) {
    return this.contactsService.addContactNote(
      req.user.userId,
      id,
      body.content,
    );
  }

  @Put(":id/notes/:noteId")
  async updateNote(
    @Request() req,
    @Param("id") id: string,
    @Param("noteId") noteId: string,
    @Body() body: { content: string },
  ) {
    return this.contactsService.updateContactNote(
      req.user.userId,
      id,
      noteId,
      body.content,
    );
  }

  @Delete(":id/notes/:noteId")
  async deleteNote(
    @Request() req,
    @Param("id") id: string,
    @Param("noteId") noteId: string,
  ) {
    await this.contactsService.deleteContactNote(req.user.userId, id, noteId);
    return { success: true };
  }

  @Put(":id/custom-fields/:fieldId")
  async setCustomFieldValue(
    @Request() req,
    @Param("id") id: string,
    @Param("fieldId") fieldId: string,
    @Body() body: { value: string },
  ) {
    await this.contactsService.setCustomFieldValue(
      req.user.userId,
      id,
      fieldId,
      body.value,
    );
    return { success: true };
  }

  @Get()
  async getAllContacts(@Request() req): Promise<ContactSearchResult[]> {
    return this.contactsService.getAllContacts(req.user.userId);
  }

  @Post("sync")
  async syncContacts(@Request() req): Promise<{ message: string }> {
    await this.boss.send(
      JOB_NAMES.SYNC_CONTACTS,
      { userId: req.user.userId },
      {
        singletonKey: `sync-contacts-${req.user.userId}`,
        singletonSeconds: SECONDS.MINUTE,
      },
    );
    return { message: "Contact sync started in the background." };
  }

  @Post()
  async createContact(
    @Request() req,
    @Body()
    body: {
      email: string;
      name?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      jobTitle?: string;
      phone?: string;
      contactType?: string;
      followUpDate?: string;
    },
  ) {
    return this.contactsService.createContact(req.user.userId, body);
  }

  @Put(":id/favorite")
  async toggleFavorite(@Request() req, @Param("id") id: string) {
    return this.contactsService.toggleFavorite(req.user.userId, id);
  }

  @Delete(":id")
  async deleteContact(@Request() req, @Param("id") id: string) {
    await this.contactsService.deleteContact(req.user.userId, id);
    return { success: true };
  }
}
