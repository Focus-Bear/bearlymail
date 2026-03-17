import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository, UpdateResult } from "typeorm";

import { ActionItem } from "../database/entities/action-item.entity";
import { ActionItemsService } from "./action-items.service";

describe("ActionItemsService", () => {
  let service: ActionItemsService;
  let repository: jest.Mocked<Repository<ActionItem>>;

  const mockActionItem: ActionItem = {
    id: "action-1",
    userId: "user-1",
    emailId: "email-1",
    emailThreadId: "thread-1",
    description: "Follow up on project proposal",
    isCompleted: false,
    source: "user",
    confidenceScore: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  } as ActionItem;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemsService,
        {
          provide: getRepositoryToken(ActionItem),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ActionItemsService>(ActionItemsService);
    repository = module.get(getRepositoryToken(ActionItem));
  });

  describe("create", () => {
    it("should create and save a new action item with userId", async () => {
      const actionItemData = {
        description: "Follow up on project proposal",
        emailId: "email-1",
        emailThreadId: "thread-1",
      };

      repository.create.mockReturnValue({
        ...actionItemData,
        userId: "user-1",
      } as ActionItem);
      repository.save.mockResolvedValue(mockActionItem);

      const result = await service.create("user-1", actionItemData);

      expect(repository.create).toHaveBeenCalledWith({
        ...actionItemData,
        userId: "user-1",
      });
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockActionItem);
    });

    it("should create action item with only description", async () => {
      const actionItemData = {
        description: "Simple action item",
      };

      repository.create.mockReturnValue({
        ...actionItemData,
        userId: "user-1",
      } as ActionItem);
      repository.save.mockResolvedValue({
        ...actionItemData,
        id: "action-2",
        userId: "user-1",
      } as ActionItem);

      const result = await service.create("user-1", actionItemData);

      expect(result.userId).toBe("user-1");
      expect(result.description).toBe("Simple action item");
    });

    it("should handle action item with isCompleted flag", async () => {
      const actionItemData = {
        description: "Completed task",
        isCompleted: true,
      };

      repository.create.mockReturnValue({
        ...actionItemData,
        userId: "user-1",
      } as ActionItem);
      repository.save.mockResolvedValue({
        ...actionItemData,
        id: "action-3",
        userId: "user-1",
      } as ActionItem);

      const result = await service.create("user-1", actionItemData);

      expect(result.isCompleted).toBe(true);
    });
  });

  describe("findAll", () => {
    it("should return all action items for a user", async () => {
      const mockItems = [mockActionItem, { ...mockActionItem, id: "action-2" }];
      repository.find.mockResolvedValue(mockItems);

      const result = await service.findAll("user-1");

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        order: { isCompleted: "ASC", createdAt: "DESC" },
      });
      expect(result).toEqual(mockItems);
    });

    it("should filter by emailId when provided", async () => {
      const mockItems = [mockActionItem];
      repository.find.mockResolvedValue(mockItems);

      const result = await service.findAll("user-1", "email-1");

      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-1", emailId: "email-1" },
        order: { isCompleted: "ASC", createdAt: "DESC" },
      });
      expect(result).toEqual(mockItems);
    });

    it("should return empty array when no action items exist", async () => {
      repository.find.mockResolvedValue([]);

      const result = await service.findAll("user-1");

      expect(result).toEqual([]);
    });

    it("should order by isCompleted ASC then createdAt DESC", async () => {
      const completedItem = {
        ...mockActionItem,
        id: "action-2",
        isCompleted: true,
      };
      const incompleteItem = {
        ...mockActionItem,
        id: "action-3",
        isCompleted: false,
      };
      repository.find.mockResolvedValue([completedItem, incompleteItem]);

      await service.findAll("user-1");

      // Verify the order parameter
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        order: { isCompleted: "ASC", createdAt: "DESC" },
      });
    });
  });

  describe("update", () => {
    it("should update an existing action item", async () => {
      const updateData = {
        description: "Updated description",
        isCompleted: true,
      };
      const updatedItem = { ...mockActionItem, ...updateData };

      repository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repository.findOne.mockResolvedValue(updatedItem);

      const result = await service.update("user-1", "action-1", updateData);

      expect(repository.update).toHaveBeenCalledWith(
        { id: "action-1", userId: "user-1" },
        updateData,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "action-1", userId: "user-1" },
      });
      expect(result).toEqual(updatedItem);
    });

    it("should update only description", async () => {
      const updateData = { description: "New description" };
      const updatedItem = { ...mockActionItem, description: "New description" };

      repository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repository.findOne.mockResolvedValue(updatedItem);

      const result = await service.update("user-1", "action-1", updateData);

      expect(result?.description).toBe("New description");
    });

    it("should update only isCompleted flag", async () => {
      const updateData = { isCompleted: true };
      const updatedItem = { ...mockActionItem, isCompleted: true };

      repository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repository.findOne.mockResolvedValue(updatedItem);

      const result = await service.update("user-1", "action-1", updateData);

      expect(result?.isCompleted).toBe(true);
    });

    it("should update emailThreadId", async () => {
      const updateData = { emailThreadId: "thread-2" };
      const updatedItem = { ...mockActionItem, emailThreadId: "thread-2" };

      repository.update.mockResolvedValue({ affected: 1 } as UpdateResult);
      repository.findOne.mockResolvedValue(updatedItem);

      const result = await service.update("user-1", "action-1", updateData);

      expect(result?.emailThreadId).toBe("thread-2");
    });

    it("should return null when action item not found", async () => {
      repository.update.mockResolvedValue({ affected: 0 } as UpdateResult);
      repository.findOne.mockResolvedValue(null);

      const result = await service.update("user-1", "nonexistent-id", {
        description: "Updated",
      });

      expect(result).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete an action item by id and userId", async () => {
      repository.delete.mockResolvedValue({ affected: 1 } as UpdateResult);

      await service.delete("user-1", "action-1");

      expect(repository.delete).toHaveBeenCalledWith({
        id: "action-1",
        userId: "user-1",
      });
    });

    it("should handle deletion of non-existent item gracefully", async () => {
      repository.delete.mockResolvedValue({ affected: 0 } as UpdateResult);

      await expect(
        service.delete("user-1", "nonexistent-id"),
      ).resolves.not.toThrow();

      expect(repository.delete).toHaveBeenCalledWith({
        id: "nonexistent-id",
        userId: "user-1",
      });
    });

    it("should only delete items belonging to the specified user", async () => {
      repository.delete.mockResolvedValue({ affected: 1 } as UpdateResult);

      await service.delete("user-1", "action-1");

      // Verify that userId is included in the delete condition
      expect(repository.delete).toHaveBeenCalledWith({
        id: "action-1",
        userId: "user-1",
      });
    });
  });
});
