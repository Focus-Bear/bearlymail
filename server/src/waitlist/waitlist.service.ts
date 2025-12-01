import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Waitlist } from '../database/entities/waitlist.entity';
import { UsersService } from '../users/users.service';
import { EncryptionHelper } from '../encryption/encryption.helper';

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(Waitlist)
    private waitlistRepository: Repository<Waitlist>,
    private usersService: UsersService,
  ) {}

  async create(email: string, firstName: string, reason: string): Promise<Waitlist> {
    // Auto-approve jeremy@focusbear.io
    const approved = email.toLowerCase() === 'jeremy@focusbear.io';
    
    const entry = this.waitlistRepository.create({
      email,
      emailHash: EncryptionHelper.hashEmail(email),
      firstName,
      reason,
      approved,
    });
    
    const saved = await this.waitlistRepository.save(entry);
    
    // If auto-approved, create user account immediately
    if (approved) {
      const isAdmin = email.toLowerCase() === 'jeremy@focusbear.io';
      await this.usersService.create({
        email,
        name: firstName,
        isApproved: true,
        isAdmin,
      });
    }
    
    return saved;
  }

  async findAll(): Promise<Waitlist[]> {
    return this.waitlistRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Waitlist> {
    return this.waitlistRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<Waitlist | null> {
    const emailHash = EncryptionHelper.hashEmail(email);
    return this.waitlistRepository.findOne({ where: { emailHash } });
  }

  async approve(id: string): Promise<Waitlist> {
    const entry = await this.findOne(id);
    if (!entry) throw new Error('Waitlist entry not found');
    
    await this.waitlistRepository.update(id, { approved: true });
    
    // Create user account when approved
    // entry.email is automatically decrypted by the transformer
    const existingUser = await this.usersService.findByEmail(entry.email);
    if (!existingUser) {
      await this.usersService.create({
        email: entry.email,
        name: entry.firstName,
        isApproved: true,
        isAdmin: entry.email.toLowerCase() === 'jeremy@focusbear.io',
      });
    } else {
      // Update existing user to approved
      await this.usersService.update(existingUser.id, { isApproved: true });
    }
    
    return this.findOne(id);
  }
}

