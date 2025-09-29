import { Request, Response } from 'express';

// Mock the PostService before importing anything
const mockCreatePost = jest.fn();
const mockGetPosts = jest.fn();
const mockGetPostById = jest.fn();
const mockLikePost = jest.fn();
const mockUnlikePost = jest.fn();

jest.mock('../../../services/PostService', () => {
  return {
    PostService: jest.fn().mockImplementation(() => ({
      createPost: mockCreatePost,
      getPosts: mockGetPosts,
      getPostById: mockGetPostById,
      likePost: mockLikePost,
      unlikePost: mockUnlikePost
    }))
  };
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn()
  }
}));

// Now import the controllers
import {
  createPost,
  getPosts,
  getPostById,
  likePost,
  unlikePost,
  getPostAnalytics
} from '../../../controllers/postController';
import { createMockRequest, createMockResponse } from '../../utils/testUtils';
import { ScoringAlgorithm, SortOption, SortOrder } from '../../../types/scoring';

describe('Post Controller Unit Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;

  beforeEach(() => {
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn().mockReturnThis();
    
    mockRequest = {
      userId: 'user123',
      body: {},
      params: {},
      query: {}
    };
    
    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('createPost', () => {
    it('should create a post successfully', async () => {
      const postData = {
        title: 'Test Post',
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439011'
      };

      mockRequest.body = postData;

      const mockPost = { 
        _id: '507f1f77bcf86cd799439012', 
        ...postData, 
        authorId: 'user123',
        likeCount: 0,
        score: 1.5
      };

      mockCreatePost.mockResolvedValue(mockPost);

      await createPost(mockRequest as Request, mockResponse as Response);

      expect(mockCreatePost).toHaveBeenCalledWith({
        title: postData.title,
        content: postData.content,
        categoryId: postData.categoryId,
        authorId: 'user123'
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockPost,
        message: 'Post created successfully'
      });
    });

    it('should return 400 for missing required fields', async () => {
      mockRequest.body = {
        title: '', // Missing title
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439011'
      };

      await createPost(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Title, content, and categoryId are required'
      });
      expect(mockCreatePost).not.toHaveBeenCalled();
    });

    it('should return 400 for non-existent category', async () => {
      mockRequest.body = {
        title: 'Test Post',
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439013'
      };

      mockCreatePost.mockRejectedValue(new Error('Category does not exist'));

      await createPost(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Category does not exist'
      });
    });

    it('should handle service errors', async () => {
      mockRequest.body = {
        title: 'Test Post',
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439011'
      };

      mockCreatePost.mockRejectedValue(new Error('Database error'));

      await createPost(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to create post'
      });
    });
  });

  describe('getPosts', () => {
    it('should get posts with default pagination', async () => {
      mockRequest.query = {};

      const mockPosts = [
        { _id: '507f1f77bcf86cd799439014', title: 'Post 1', content: 'Content 1' },
        { _id: '507f1f77bcf86cd799439015', title: 'Post 2', content: 'Content 2' }
      ];

      const mockResult = {
        posts: mockPosts,
        pagination: {
          page: 1,
          limit: 20,
          offset: 0,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
          nextOffset: null,
          prevOffset: null
        }
      };

      mockGetPosts.mockResolvedValue(mockResult);

      await getPosts(mockRequest as Request, mockResponse as Response);

      expect(mockGetPosts).toHaveBeenCalledWith(
        { 
          categoryId: undefined, 
          sortBy: undefined, 
          order: undefined,
          scoringConfig: {
            algorithm: 'base',
            freshnessWeight: 1,
            maxAgeHours: 168
          }
        },
        { page: NaN, limit: NaN, offset: NaN }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockPosts,
        pagination: mockResult.pagination,
          scoring: {
          algorithm: 'base',
          freshnessWeight: 1,
          maxAgeHours: 168
        }
      });
    });

    it('should handle custom pagination parameters', async () => {
      mockRequest.query = {
        page: '2',
        limit: '10',
        sortBy: 'likeCount',
        order: 'desc',
        category: 'tech'
      };

      const mockPosts = [{ _id: '507f1f77bcf86cd799439016', title: 'Post 1' }];
      const mockResult = {
        posts: mockPosts,
        pagination: {
          page: 2,
          limit: 10,
          offset: 10,
          total: 15,
          totalPages: 2,
          hasNext: true,
          hasPrevious: true,
          nextOffset: 20,
          prevOffset: 0
        }
      };

      mockGetPosts.mockResolvedValue(mockResult);

      await getPosts(mockRequest as Request, mockResponse as Response);

      expect(mockGetPosts).toHaveBeenCalledWith(
        { 
          categoryId: 'tech', 
          sortBy: 'likeCount', 
          order: 'desc',
          scoringConfig: {
            algorithm: 'base',
            freshnessWeight: 1,
            maxAgeHours: 168
          }
        },
        { page: 2, limit: 10, offset: NaN }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockPosts,
        pagination: mockResult.pagination,
        scoring: {
          algorithm: 'base',
          freshnessWeight: 1,
          maxAgeHours: 168
        }
      });
    });
  });

  describe('getPostById', () => {
    it('should get a post by ID successfully', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439017' };

      const mockPost = {
        _id: '507f1f77bcf86cd799439017',
        title: 'Test Post',
        content: 'Test content',
        categoryId: { name: 'Tech' }
      };

      mockGetPostById.mockResolvedValue(mockPost);

      await getPostById(mockRequest as Request, mockResponse as Response);

      expect(mockGetPostById).toHaveBeenCalledWith('507f1f77bcf86cd799439017');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockPost
      });
    });

    it('should return 404 for non-existent post', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439018' };

      mockGetPostById.mockRejectedValue(new Error('Post not found'));

      await getPostById(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post not found'
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439019' };

      mockGetPostById.mockRejectedValue(new Error('Database error'));

      await getPostById(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch post'
      });
    });
  });

  describe('likePost', () => {
    it('should like a post successfully', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439020' };

      const mockResult = {
        liked: true,
        likeCount: 6,
        post: { _id: '507f1f77bcf86cd799439020', title: 'Test Post', likeCount: 6 }
      };

      mockLikePost.mockResolvedValue(mockResult);

      await likePost(mockRequest as Request, mockResponse as Response);

      expect(mockLikePost).toHaveBeenCalledWith('user123', '507f1f77bcf86cd799439020');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          post: mockResult.post,
          message: 'Post liked successfully'
        }
      });
    });

    it('should return 404 for non-existent post', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439021' };

      mockLikePost.mockRejectedValue(new Error('Post not found'));

      await likePost(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post not found'
      });
    });

    it('should return 400 if post already liked', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439022' };

      mockLikePost.mockRejectedValue(new Error('Post already liked by this user'));

      await likePost(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post already liked by this user'
      });
    });
  });

  describe('unlikePost', () => {
    it('should unlike a post successfully', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439023' };

      const mockResult = {
        liked: false,
        likeCount: 4,
        post: { _id: '507f1f77bcf86cd799439023', title: 'Test Post', likeCount: 4 }
      };

      mockUnlikePost.mockResolvedValue(mockResult);

      await unlikePost(mockRequest as Request, mockResponse as Response);

      expect(mockUnlikePost).toHaveBeenCalledWith('user123', '507f1f77bcf86cd799439023');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          post: mockResult.post,
          message: 'Post unliked successfully'
        }
      });
    });

    it('should return 400 if post not liked by user', async () => {
      mockRequest.params = { id: '507f1f77bcf86cd799439024' };

      mockUnlikePost.mockRejectedValue(new Error('Post not liked by this user'));

      await unlikePost(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Post not liked by this user'
      });
    });
  });
});