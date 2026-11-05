import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { Deal } from "../database/entities/deal.entity";
import { DealNote } from "../database/entities/deal-note.entity";
import { DealNotesService } from "./deal-notes.service";

const OWNER_ID = "owner-1";
const OTHER_USER_ID = "intruder-2";
const DEAL_ID = "deal-1";
const NOTE_ID = "note-1";
const CREATED_AT = new Date("2026-11-01T09:00:00Z");
const UPDATED_AT = new Date("2026-11-02T10:30:00Z");

const makeNote = (overrides: Partial<DealNote> = {}): DealNote =>
  Object.assign(new DealNote(), {
    id: NOTE_ID,
    dealId: DEAL_ID,
    userId: OWNER_ID,
    content: "Called Dana, wants a 3-year quote",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  });

describe("DealNotesService", () => {
  let service: DealNotesService;
  const dealRepository = { exists: jest.fn() };
  const dealNoteRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((fields: Partial<DealNote>) =>
      Object.assign(new DealNote(), fields),
    ),
    save: jest.fn(async (note: DealNote) =>
      Object.assign(note, {
        id: note.id ?? NOTE_ID,
        createdAt: note.createdAt ?? CREATED_AT,
        updatedAt: UPDATED_AT,
      }),
    ),
    remove: jest.fn(),
  };

  // Ownership is decided by the WHERE clause, so the fakes answer as the
  // database would: only rows matching the caller's userId exist.
  const givenDealOwnedBy = (ownerId: string) =>
    dealRepository.exists.mockImplementation(
      async ({ where }: { where: { id: string; userId: string } }) =>
        where.id === DEAL_ID && where.userId === ownerId,
    );
  const givenNoteOwnedBy = (ownerId: string) =>
    dealNoteRepository.findOne.mockImplementation(
      async ({ where }: { where: Partial<DealNote> }) =>
        where.id === NOTE_ID &&
        where.dealId === DEAL_ID &&
        where.userId === ownerId
          ? makeNote()
          : null,
    );

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DealNotesService,
        { provide: getRepositoryToken(Deal), useValue: dealRepository },
        {
          provide: getRepositoryToken(DealNote),
          useValue: dealNoteRepository,
        },
      ],
    }).compile();
    service = moduleRef.get(DealNotesService);
  });

  describe("listNotes", () => {
    it("returns the owner's notes newest first with timestamps", async () => {
      givenDealOwnedBy(OWNER_ID);
      dealNoteRepository.find.mockResolvedValue([makeNote()]);

      const notes = await service.listNotes(OWNER_ID, DEAL_ID);

      expect(dealNoteRepository.find).toHaveBeenCalledWith({
        where: { dealId: DEAL_ID, userId: OWNER_ID },
        order: { createdAt: "DESC" },
      });
      expect(notes).toEqual([
        {
          id: NOTE_ID,
          dealId: DEAL_ID,
          content: "Called Dana, wants a 3-year quote",
          createdAt: CREATED_AT.toISOString(),
          updatedAt: UPDATED_AT.toISOString(),
        },
      ]);
    });

    it("hides another user's deal as not found", async () => {
      givenDealOwnedBy(OWNER_ID);
      await expect(
        service.listNotes(OTHER_USER_ID, DEAL_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dealNoteRepository.find).not.toHaveBeenCalled();
    });
  });

  describe("addNote", () => {
    it("stores the note against the deal and the owner", async () => {
      givenDealOwnedBy(OWNER_ID);

      const note = await service.addNote(OWNER_ID, DEAL_ID, "Sent proposal");

      expect(dealNoteRepository.create).toHaveBeenCalledWith({
        dealId: DEAL_ID,
        userId: OWNER_ID,
        content: "Sent proposal",
      });
      expect(note.content).toBe("Sent proposal");
    });

    it("refuses to add a note to another user's deal", async () => {
      givenDealOwnedBy(OWNER_ID);
      await expect(
        service.addNote(OTHER_USER_ID, DEAL_ID, "Sneaky"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dealNoteRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("updateNote", () => {
    it("edits the owner's note and returns the new updatedAt", async () => {
      givenNoteOwnedBy(OWNER_ID);

      const note = await service.updateNote(
        OWNER_ID,
        DEAL_ID,
        NOTE_ID,
        "Proposal accepted",
      );

      expect(note.content).toBe("Proposal accepted");
      expect(note.updatedAt).toBe(UPDATED_AT.toISOString());
    });

    it("refuses to edit another user's note", async () => {
      givenNoteOwnedBy(OWNER_ID);
      await expect(
        service.updateNote(OTHER_USER_ID, DEAL_ID, NOTE_ID, "Overwritten"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dealNoteRepository.save).not.toHaveBeenCalled();
    });

    it("refuses a note addressed through a different deal", async () => {
      givenNoteOwnedBy(OWNER_ID);
      await expect(
        service.updateNote(OWNER_ID, "other-deal", NOTE_ID, "Moved"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("deleteNote", () => {
    it("removes the owner's note", async () => {
      givenNoteOwnedBy(OWNER_ID);
      await service.deleteNote(OWNER_ID, DEAL_ID, NOTE_ID);
      expect(dealNoteRepository.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: NOTE_ID }),
      );
    });

    it("refuses to delete another user's note", async () => {
      givenNoteOwnedBy(OWNER_ID);
      await expect(
        service.deleteNote(OTHER_USER_ID, DEAL_ID, NOTE_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dealNoteRepository.remove).not.toHaveBeenCalled();
    });
  });
});
