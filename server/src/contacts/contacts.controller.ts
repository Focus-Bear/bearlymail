import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ContactsService, ContactSearchResult } from './contacts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  /**
   * Search contacts with autocomplete support
   * Uses blind indexing for searchable encryption
   */
  @Get('search')
  async searchContacts(
    @Request() req,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<ContactSearchResult[]> {
    const maxLimit = limit ? Math.min(parseInt(limit, 10), 50) : 20;
    return this.contactsService.searchContacts(req.user.userId, query || '', maxLimit);
  }

  /**
   * Get frequently contacted contacts (for empty state in compose)
   */
  @Get('frequent')
  async getFrequentContacts(
    @Request() req,
    @Query('limit') limit?: string,
  ): Promise<ContactSearchResult[]> {
    const maxLimit = limit ? Math.min(parseInt(limit, 10), 20) : 10;
    return this.contactsService.getFrequentContacts(req.user.userId, maxLimit);
  }

  /**
   * Get all contacts
   */
  @Get()
  async getAllContacts(@Request() req): Promise<ContactSearchResult[]> {
    return this.contactsService.getAllContacts(req.user.userId);
  }

  /**
   * Sync contacts from all connected providers
   */
  @Post('sync')
  async syncContacts(
    @Request() req,
    @Query('full') fullSync?: string,
  ): Promise<{ synced: number; provider: string }[]> {
    return this.contactsService.syncContacts(req.user.userId, fullSync === 'true');
  }

  /**
   * Create a new manual contact
   */
  @Post()
  async createContact(
    @Request() req,
    @Body() body: { 
      email: string; 
      name?: string; 
      firstName?: string; 
      lastName?: string; 
      company?: string; 
      jobTitle?: string;
    },
  ) {
    return this.contactsService.createContact(req.user.userId, body);
  }

  /**
   * Toggle favorite status
   */
  @Put(':id/favorite')
  async toggleFavorite(@Request() req, @Param('id') id: string) {
    return this.contactsService.toggleFavorite(req.user.userId, id);
  }

  /**
   * Delete a contact
   */
  @Delete(':id')
  async deleteContact(@Request() req, @Param('id') id: string) {
    await this.contactsService.deleteContact(req.user.userId, id);
    return { success: true };
  }
}

