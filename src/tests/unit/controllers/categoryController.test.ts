import { Request, Response } from 'express';
import { CategoryService } from '../../../services/CategoryService';

// Mock the service and logger before importing the controller
jest.mock('../../../services/CategoryService');
jest.mock('../../../utils/logger');

// Create a mock instance that will be used by the controller
const mockCategoryServiceInstance = {
  createCategory: jest.fn(),
  getAllCategories: jest.fn(),
  deleteCategory: jest.fn(),
  updateCategoryStatus: jest.fn(),
  getActiveCategories: jest.fn()
} as jest.Mocked<CategoryService>;

// Mock the CategoryService constructor to always return the same instance
const MockedCategoryService = CategoryService as jest.MockedClass<typeof CategoryService>;
MockedCategoryService.mockImplementation(() => mockCategoryServiceInstance);

// Import the controller functions after mocking
import {
  createCategory,
  getCategories,
  deleteCategory,
  updateCategoryStatus,
  getActiveCategories
} from '../../../controllers/categoryController';
import { createMockRequest, createMockResponse } from '../../utils/testUtils';

describe('Category Controller Unit Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      userId: 'user123'
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('createCategory', () => {
    it('should create a category successfully', async () => {
      const categoryData = {
        name: 'Technology',
        description: 'Tech-related posts'
      };

      mockRequest.body = categoryData;

      const mockCategory = {
        _id: 'category123',
        ...categoryData,
        postCount: 0,
        createdAt: new Date()
      };

      mockCategoryServiceInstance.createCategory.mockResolvedValue(mockCategory as any);

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(mockCategoryServiceInstance.createCategory).toHaveBeenCalledWith(categoryData);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockCategory,
        message: 'Category created successfully'
      });
    });

    it('should return 400 for missing name', async () => {
      mockRequest.body = {
        description: 'Test description'
      };

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
      expect(mockCategoryServiceInstance.createCategory).not.toHaveBeenCalled();
    });

    it('should return 400 for empty name', async () => {
      mockRequest.body = {
        name: '   ',
        description: 'Test description'
      };

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category name is required'
      });
    });

    it('should return 409 for duplicate category', async () => {
      mockRequest.body = {
        name: 'Technology',
        description: 'Tech posts'
      };

      mockCategoryServiceInstance.createCategory.mockRejectedValue(new Error('Category already exists'));

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category already exists'
      });
    });

    it('should handle service errors', async () => {
      mockRequest.body = {
        name: 'Technology',
        description: 'Tech posts'
      };

      mockCategoryServiceInstance.createCategory.mockRejectedValue(new Error('Database error'));

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create category'
      });
    });
  });

  describe('getCategories', () => {
    it('should get all categories successfully', async () => {
      const mockCategories = [
        { _id: 'cat1', name: 'Technology', description: 'Tech posts', postCount: 5 },
        { _id: 'cat2', name: 'Sports', description: 'Sports posts', postCount: 3 },
        { _id: 'cat3', name: 'Travel', description: 'Travel posts', postCount: 2 }
      ];

      mockCategoryServiceInstance.getAllCategories.mockResolvedValue(mockCategories as any);

      await getCategories(mockRequest as Request, mockResponse as Response);

      expect(mockCategoryServiceInstance.getAllCategories).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockCategories
      });
    });

    it('should return empty array when no categories exist', async () => {
      mockCategoryServiceInstance.getAllCategories.mockResolvedValue([]);

      await getCategories(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should handle service errors', async () => {
      const dbError = new Error('Database connection failed');
      mockCategoryServiceInstance.getAllCategories.mockRejectedValue(dbError);

      await getCategories(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch categories'
      });
    });
  });

  describe('deleteCategory', () => {
    it('should delete category successfully', async () => {
      mockRequest.params = { id: 'category123' };

      const mockResult = { message: 'Category deleted successfully' };

      mockCategoryServiceInstance.deleteCategory.mockResolvedValue(mockResult);

      await deleteCategory(mockRequest as Request, mockResponse as Response);

      expect(mockCategoryServiceInstance.deleteCategory).toHaveBeenCalledWith('category123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Category deleted successfully'
      });
    });

    it('should return 400 for category with posts', async () => {
      mockRequest.params = { id: 'category123' };

      mockCategoryServiceInstance.deleteCategory.mockRejectedValue(new Error('Cannot delete category with existing posts'));

      await deleteCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot delete category with existing posts'
      });
    });
  });

  describe('updateCategoryStatus', () => {
    it('should update category status successfully', async () => {
      mockRequest.params = { id: 'category123' };
      mockRequest.body = { isActive: false };

      const mockCategory = {
        _id: 'category123',
        name: 'Test Category',
        isActive: false
      } as any;

      mockCategoryServiceInstance.updateCategoryStatus.mockResolvedValue(mockCategory);

      await updateCategoryStatus(mockRequest as Request, mockResponse as Response);

      expect(mockCategoryServiceInstance.updateCategoryStatus).toHaveBeenCalledWith('category123', false);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockCategory,
        message: 'Category deactivated successfully'
      });
    });

    it('should return 400 for invalid isActive value', async () => {
      mockRequest.params = { id: 'category123' };
      mockRequest.body = { isActive: 'invalid' };

      await updateCategoryStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'isActive must be a boolean value'
      });
    });
  });

  describe('getActiveCategories', () => {
    it('should return active categories successfully', async () => {
      const mockActiveCategories = [
        {
          _id: 'category1',
          name: 'Active Category 1',
          description: 'Description 1',
          isActive: true
        },
        {
          _id: 'category2',
          name: 'Active Category 2',
          description: 'Description 2',
          isActive: true
        }
      ] as any;

      mockCategoryServiceInstance.getActiveCategories.mockResolvedValue(mockActiveCategories);

      await getActiveCategories(mockRequest as Request, mockResponse as Response);

      expect(mockCategoryServiceInstance.getActiveCategories).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockActiveCategories
      });
    });
  });
});