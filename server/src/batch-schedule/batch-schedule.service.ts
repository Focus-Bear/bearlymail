import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BatchSchedule } from '../database/entities/batch-schedule.entity';

@Injectable()
export class BatchScheduleService {
  private readonly logger = new Logger(BatchScheduleService.name);

  constructor(
    @InjectRepository(BatchSchedule)
    private batchScheduleRepository: Repository<BatchSchedule>,
  ) {}

  /**
   * Get the batch schedule for a user
   */
  async getSchedule(userId: string): Promise<BatchSchedule | null> {
    return this.batchScheduleRepository.findOne({ where: { userId } });
  }

  /**
   * Create or update the batch schedule for a user
   */
  async upsertSchedule(
    userId: string,
    data: {
      deliveryDays: number[];
      deliveryTimes: string[];
      timezone: string;
      isEnabled: boolean;
      urgentBypassSchedule: boolean;
    },
  ): Promise<BatchSchedule> {
    let schedule = await this.batchScheduleRepository.findOne({ where: { userId } });
    
    if (schedule) {
      schedule.deliveryDays = data.deliveryDays;
      schedule.deliveryTimes = data.deliveryTimes;
      schedule.timezone = data.timezone;
      schedule.isEnabled = data.isEnabled;
      schedule.urgentBypassSchedule = data.urgentBypassSchedule;
    } else {
      schedule = this.batchScheduleRepository.create({
        userId,
        ...data,
      });
    }
    
    return this.batchScheduleRepository.save(schedule);
  }

  /**
   * Calculate the next batch release time based on the schedule
   */
  getNextBatchReleaseTime(schedule: BatchSchedule, isUrgent: boolean = false): Date | null {
    // If batching is disabled or urgent bypasses schedule
    if (!schedule.isEnabled || (isUrgent && schedule.urgentBypassSchedule)) {
      return null; // Release immediately
    }

    const now = new Date();
    const userTimezone = schedule.timezone || 'UTC';
    
    // Convert to user's timezone
    const nowInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    const currentDay = nowInUserTz.getDay();
    const currentTime = `${String(nowInUserTz.getHours()).padStart(2, '0')}:${String(nowInUserTz.getMinutes()).padStart(2, '0')}`;
    
    // Parse delivery times and sort them
    const sortedTimes = [...schedule.deliveryTimes].sort();
    
    // Check if we can deliver today
    if (schedule.deliveryDays.includes(currentDay)) {
      // Find the next delivery time today
      for (const time of sortedTimes) {
        if (time > currentTime) {
          return this.createDateInTimezone(nowInUserTz, time, userTimezone);
        }
      }
    }
    
    // Find the next delivery day
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const nextDay = (currentDay + daysToAdd) % 7;
      if (schedule.deliveryDays.includes(nextDay)) {
        // Use the first delivery time of that day
        const nextDate = new Date(nowInUserTz);
        nextDate.setDate(nextDate.getDate() + daysToAdd);
        return this.createDateInTimezone(nextDate, sortedTimes[0], userTimezone);
      }
      daysToAdd++;
    }
    
    // No delivery days configured - release immediately
    return null;
  }

  /**
   * Create a date object for a specific time in a timezone
   */
  private createDateInTimezone(baseDate: Date, time: string, timezone: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const result = new Date(baseDate);
    result.setHours(hours, minutes, 0, 0);
    
    // Convert back to UTC for storage
    // This is a simplified approach - in production you'd use a proper timezone library
    return result;
  }

  /**
   * Check if now is within delivery hours
   */
  isWithinDeliveryWindow(schedule: BatchSchedule): boolean {
    if (!schedule.isEnabled) return true;
    
    const now = new Date();
    const userTimezone = schedule.timezone || 'UTC';
    const nowInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    
    const currentDay = nowInUserTz.getDay();
    const currentTime = `${String(nowInUserTz.getHours()).padStart(2, '0')}:${String(nowInUserTz.getMinutes()).padStart(2, '0')}`;
    
    // Check if today is a delivery day
    if (!schedule.deliveryDays.includes(currentDay)) {
      return false;
    }
    
    // Check if current time is within 30 minutes of a delivery time
    for (const deliveryTime of schedule.deliveryTimes) {
      const [dHours, dMinutes] = deliveryTime.split(':').map(Number);
      const deliveryMinutes = dHours * 60 + dMinutes;
      const [cHours, cMinutes] = currentTime.split(':').map(Number);
      const currentMinutes = cHours * 60 + cMinutes;
      
      // Within 30 minutes after delivery time
      if (currentMinutes >= deliveryMinutes && currentMinutes < deliveryMinutes + 30) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get default schedule for new users
   */
  getDefaultSchedule(): Partial<BatchSchedule> {
    return {
      deliveryDays: [1, 2, 3, 4, 5], // Monday to Friday
      deliveryTimes: ['11:00', '15:00'], // 11am and 3pm
      timezone: 'UTC',
      isEnabled: true,
      urgentBypassSchedule: true,
    };
  }
}




