import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { SchedulingPreference } from "../database/entities/scheduling-preference.entity";
import { FALLBACK_TIMEZONE, normalizeTimezone } from "../utils/timezone.utils";

export interface SchedulingPreferenceData {
  availabilityStartHour: number;
  availabilityEndHour: number;
  availabilityDays: number[];
  meetingGapMinutes: number;
  deepWorkHoursPerDay: number;
  slotDurationMinutes: number;
  timezone: string;
}

const DEFAULT_PREFERENCES: SchedulingPreferenceData = {
  availabilityStartHour: 9,
  availabilityEndHour: 17,
  availabilityDays: [1, 2, 3, 4, 5],
  meetingGapMinutes: 30,
  deepWorkHoursPerDay: 2,
  slotDurationMinutes: 30,
  timezone: FALLBACK_TIMEZONE,
};

@Injectable()
export class SchedulingPreferencesService {
  constructor(
    @InjectRepository(SchedulingPreference)
    private readonly repository: Repository<SchedulingPreference>,
  ) {}

  async getPreferences(userId: string): Promise<SchedulingPreferenceData> {
    const prefs = await this.repository.findOne({ where: { userId } });
    if (!prefs) {
      return { ...DEFAULT_PREFERENCES };
    }
    return {
      availabilityStartHour: prefs.availabilityStartHour,
      availabilityEndHour: prefs.availabilityEndHour,
      availabilityDays: prefs.availabilityDays.map(Number),
      meetingGapMinutes: prefs.meetingGapMinutes,
      deepWorkHoursPerDay: prefs.deepWorkHoursPerDay,
      slotDurationMinutes: prefs.slotDurationMinutes,
      // Sanitise on read: existing DB rows may contain Windows-style timezone
      // strings from before this guard was added.
      timezone: normalizeTimezone(prefs.timezone),
    };
  }

  async upsertPreferences(
    userId: string,
    preferenceUpdates: Partial<SchedulingPreferenceData>,
  ): Promise<SchedulingPreferenceData> {
    // Normalise timezone on write so Windows-style strings never reach the DB
    const normalizedUpdates: Partial<SchedulingPreferenceData> = {
      ...preferenceUpdates,
      ...(preferenceUpdates.timezone !== undefined && {
        timezone: normalizeTimezone(preferenceUpdates.timezone),
      }),
    };

    let prefs = await this.repository.findOne({ where: { userId } });
    if (!prefs) {
      prefs = this.repository.create({
        userId,
        ...DEFAULT_PREFERENCES,
        ...normalizedUpdates,
      });
    } else {
      Object.assign(prefs, normalizedUpdates);
    }
    const saved = await this.repository.save(prefs);
    return {
      availabilityStartHour: saved.availabilityStartHour,
      availabilityEndHour: saved.availabilityEndHour,
      availabilityDays: saved.availabilityDays.map(Number),
      meetingGapMinutes: saved.meetingGapMinutes,
      deepWorkHoursPerDay: saved.deepWorkHoursPerDay,
      slotDurationMinutes: saved.slotDurationMinutes,
      timezone: saved.timezone,
    };
  }
}
