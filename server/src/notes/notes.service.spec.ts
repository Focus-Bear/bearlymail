import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { PrivateNote } from "../database/entities/private-note.entity";
import { NotesService } from "./notes.service";

describe("NotesService", () => {
  let service: NotesService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        {
          provide: getRepositoryToken(PrivateNote),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getNoteByThread", () => {
    it("should return note for thread", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const mockNote = {
        id: "note-1",
        userId,
        emailThreadId: threadId,
        content: "Test note",
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockNote);

      const result = await service.getNoteByThread(userId, threadId);

      expect(result).toEqual(mockNote);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { userId, emailThreadId: threadId },
        order: { createdAt: "DESC" },
      });
    });

    it("should return null when note not found", async () => {
      const userId = "user-123";
      const threadId = "thread-123";

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getNoteByThread(userId, threadId);

      expect(result).toBeNull();
    });
  });

  describe("createOrUpdateNote", () => {
    it("should create new note when none exists", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const content = "New note content";
      const mockNote = {
        id: "note-1",
        userId,
        emailThreadId: threadId,
        content,
        createdAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockNote);
      mockRepository.save.mockResolvedValue(mockNote);

      const result = await service.createOrUpdateNote(
        userId,
        threadId,
        content,
      );

      expect(result).toEqual(mockNote);
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        emailThreadId: threadId,
        content,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockNote);
    });

    it("should update existing note", async () => {
      const userId = "user-123";
      const threadId = "thread-123";
      const existingNote = {
        id: "note-1",
        userId,
        emailThreadId: threadId,
        content: "Old content",
        createdAt: new Date(),
      };
      const updatedNote = {
        ...existingNote,
        content: "New content",
      };

      mockRepository.findOne.mockResolvedValue(existingNote);
      mockRepository.save.mockResolvedValue(updatedNote);

      const result = await service.createOrUpdateNote(
        userId,
        threadId,
        "New content",
      );

      expect(result).toEqual(updatedNote);
      expect(existingNote.content).toBe("New content");
      expect(mockRepository.save).toHaveBeenCalledWith(existingNote);
      expect(mockRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteNote", () => {
    it("should delete note by ID", async () => {
      const userId = "user-123";
      const noteId = "note-123";

      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteNote(userId, noteId);

      expect(mockRepository.delete).toHaveBeenCalledWith({
        noteId,
        userId,
      });
    });
  });

  describe("getAllNotes", () => {
    it("should return all notes for user ordered by createdAt DESC", async () => {
      const userId = "user-123";
      const mockNotes = [
        {
          id: "note-1",
          userId,
          emailThreadId: "thread-1",
          content: "Note 1",
          createdAt: new Date("2024-01-02"),
        },
        {
          id: "note-2",
          userId,
          emailThreadId: "thread-2",
          content: "Note 2",
          createdAt: new Date("2024-01-01"),
        },
      ];

      mockRepository.find.mockResolvedValue(mockNotes);

      const result = await service.getAllNotes(userId);

      expect(result).toEqual(mockNotes);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: "DESC" },
      });
    });

    it("should return empty array when no notes exist", async () => {
      const userId = "user-123";

      mockRepository.find.mockResolvedValue([]);

      const result = await service.getAllNotes(userId);

      expect(result).toEqual([]);
    });
  });
});
