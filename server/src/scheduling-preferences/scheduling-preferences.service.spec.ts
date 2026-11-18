import { Repository } from "typeorm";

import { SchedulingPreference } from "../database/entities/scheduling-preference.entity";
import { SchedulingPreferencesService } from "./scheduling-preferences.service";

const USER_ID = "user-1";
const BROWSER_TIMEZONE = "Australia/Melbourne";

function buildRow(): SchedulingPreference {
  return {
    userId: USER_ID,
    availabilityStartHour: 9,
    availabilityEndHour: 17,
    availabilityDays: [1, 2, 3, 4, 5],
    meetingGapMinutes: 30,
    deepWorkHoursPerDay: 2,
    slotDurationMinutes: 30,
    timezone: "UTC",
  } as SchedulingPreference;
}

function buildRepository(existingRow: SchedulingPreference | null) {
  const insertBuilder = {
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const repository = {
    findOne: jest.fn().mockResolvedValue(existingRow),
    findOneOrFail: jest.fn().mockResolvedValue(buildRow()),
    createQueryBuilder: jest.fn().mockReturnValue(insertBuilder),
    save: jest.fn().mockImplementation(async (row) => row),
  };
  return { repository, insertBuilder };
}

describe("SchedulingPreferencesService.upsertPreferences", () => {
  it("creates the first row with a conflict-ignoring insert so concurrent first saves cannot collide", async () => {
    const { repository, insertBuilder } = buildRepository(null);
    const service = new SchedulingPreferencesService(
      repository as unknown as Repository<SchedulingPreference>,
    );

    const saved = await service.upsertPreferences(USER_ID, {
      timezone: BROWSER_TIMEZONE,
    });

    expect(insertBuilder.orIgnore).toHaveBeenCalled();
    expect(repository.findOneOrFail).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
    expect(saved.timezone).toBe(BROWSER_TIMEZONE);
  });

  it("updates an existing row without inserting", async () => {
    const { repository } = buildRepository(buildRow());
    const service = new SchedulingPreferencesService(
      repository as unknown as Repository<SchedulingPreference>,
    );

    const saved = await service.upsertPreferences(USER_ID, {
      meetingGapMinutes: 15,
    });

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(saved.meetingGapMinutes).toBe(15);
  });
});
