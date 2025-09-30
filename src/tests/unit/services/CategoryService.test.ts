import {
  CategoryService,
  CreateCategoryData,
} from '../../../services/CategoryService';
import { Category } from '../../../models/Category';

// Mock the model and logger
jest.mock('../../../models/Category');
jest.mock('../../../utils/logger');

const MockedCategory = Category as jest.Mocked<typeof Category>;

describe('CategoryService', () => {
  let categoryService: CategoryService;

  beforeEach(() => {
    categoryService = new CategoryService();
    jest.clearAllMocks();
  });

  describe('createCategory', () => {
    const mockCategoryData: CreateCategoryData = {
      name: 'Technology',
      description: 'Tech-related posts',
    };

    const mockCategory = {
      _id: '64a1b2c3d4e5f6789abc1234',
      name: 'Technology',
      description: 'Tech-related posts',
      save: jest.fn(),
    };

    it('should create category successfully', async () => {
      MockedCategory.findOne = jest.fn().mockResolvedValue(null);
      MockedCategory.prototype.save = jest.fn().mockResolvedValue(mockCategory);

      // Act
      const result = await categoryService.createCategory(mockCategoryData);

      // Assert
      expect(MockedCategory.findOne).toHaveBeenCalledWith({
        name: { $regex: new RegExp(`^${mockCategoryData.name}$`, 'i') },
      });
      expect(MockedCategory.prototype.save).toHaveBeenCalled();
    });

    it('should throw error if category already exists', async () => {
      MockedCategory.findOne = jest.fn().mockResolvedValue(mockCategory);

      await expect(
        categoryService.createCategory(mockCategoryData)
      ).rejects.toThrow('Category already exists');
    });

    it('should trim whitespace from name and description', async () => {
      const dataWithWhitespace = {
        name: '  Technology  ',
        description: '  Tech-related posts  ',
      };
      MockedCategory.findOne = jest.fn().mockResolvedValue(null);
      MockedCategory.prototype.save = jest.fn().mockResolvedValue(mockCategory);

      // Act
      await categoryService.createCategory(dataWithWhitespace);

      // Assert
      expect(MockedCategory.findOne).toHaveBeenCalledWith({
        name: { $regex: new RegExp(`^  Technology  $`, 'i') },
      });
    });
  });

  describe('getAllCategories', () => {
    const mockCategories = [
      { _id: '1', name: 'Technology', description: 'Tech posts', postCount: 5 },
      { _id: '2', name: 'Sports', description: 'Sports posts', postCount: 3 },
    ];

    it('should return all categories sorted by name', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockResolvedValue(mockCategories),
      };
      MockedCategory.find = jest.fn().mockReturnValue(mockQuery);

      // Act
      const result = await categoryService.getAllCategories();

      // Assert
      expect(MockedCategory.find).toHaveBeenCalled();
      expect(mockQuery.select).toHaveBeenCalledWith(
        '_id name description postCount isActive createdAt'
      );
      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
      expect(result).toEqual(mockCategories);
    });
  });

  describe('deleteCategory', () => {
    const mockCategory = {
      _id: '64a1b2c3d4e5f6789abc1234',
      name: 'Technology',
      postCount: 0,
    };

    it('should delete category successfully when no posts exist', async () => {
      MockedCategory.findById = jest.fn().mockResolvedValue(mockCategory);
      MockedCategory.findByIdAndDelete = jest
        .fn()
        .mockResolvedValue(mockCategory);

      // Act
      const result = await categoryService.deleteCategory(
        '64a1b2c3d4e5f6789abc1234'
      );

      // Assert
      expect(MockedCategory.findById).toHaveBeenCalledWith(
        '64a1b2c3d4e5f6789abc1234'
      );
      expect(MockedCategory.findByIdAndDelete).toHaveBeenCalledWith(
        '64a1b2c3d4e5f6789abc1234'
      );
      expect(result).toEqual({ message: 'Category deleted successfully' });
    });

    it('should throw error if category not found', async () => {
      MockedCategory.findById = jest.fn().mockResolvedValue(null);

      await expect(
        categoryService.deleteCategory('nonexistent')
      ).rejects.toThrow('Category not found');
    });

    it('should throw error if category has existing posts', async () => {
      const categoryWithPosts = { ...mockCategory, postCount: 5 };
      MockedCategory.findById = jest.fn().mockResolvedValue(categoryWithPosts);

      await expect(
        categoryService.deleteCategory('64a1b2c3d4e5f6789abc1234')
      ).rejects.toThrow('Cannot delete category with existing posts');
    });
  });
});
