import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import * as chrono from "chrono-node";

@Injectable()
export class SnoozeService {
  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
  ) {}

  async snoozeEmail(
    userId: string,
    emailId: string,
    duration: string,
  ): Promise<Email> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error("Email not found");
    }

    const snoozeUntil = this.parseDuration(duration);
    email.isSnoozed = true;
    email.snoozeUntil = snoozeUntil;

    return this.emailRepository.save(email);
  }

  private parseDuration(duration: string): Date {
    const normalized = duration.toLowerCase().trim();

    // Parse with chrono for natural language dates
    const parsed = chrono.parseDate(normalized);
    if (parsed) {
      return parsed;
    }

    // Manual parsing for simple formats
    const now = new Date();
    const regex = /^(\d+)\s*(m|min|h|hr|d|w)$/;
    const match = normalized.match(regex);

    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];

      switch (unit) {
        case "m":
        case "min":
          return new Date(now.getTime() + value * 60 * 1000);
        case "h":
        case "hr":
          return new Date(now.getTime() + value * 60 * 60 * 1000);
        case "d":
          return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
        case "w":
          return new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
      }
    }

    // Try day names (mon, tue, wed, etc.)
    const dayMap: { [key: string]: number } = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };

    if (dayMap[normalized] !== undefined) {
      const targetDay = dayMap[normalized];
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;

      if (daysUntil <= 0) {
        daysUntil += 7; // Next week
      }

      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + daysUntil);
      nextDate.setHours(9, 0, 0, 0); // Default to 9 AM

      return nextDate;
    }

    // Default to 1 hour if parsing fails
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  async unsnoozeEmail(userId: string, emailId: string): Promise<Email> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new Error("Email not found");
    }

    email.isSnoozed = false;
    email.snoozeUntil = null;

    return this.emailRepository.save(email);
  }
}
