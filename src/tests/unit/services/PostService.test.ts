// Mock modules first
jest.mock('mongoose', () => {
  class ObjectId {
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    toString() {
      return this.id;
    }
    static isValid(id: any) {
      return typeof id === 'string' && id.length === 24;
    }
  }

  return {
    ...jest.requireActual('mongoose'),
    Schema: {
      Types: {
        ObjectId: jest.fn().mockImplementation((id: string) => id || '507f1f77bcf86cd799439012'),
      },
    },
    Types: { ObjectId },
    startSession: jest.fn(),
  };
});

jest.mock('../../../models/Post', () => {
  // Function-style constructor for Post
  const Post: any = jest.fn(function (this: any, doc: any) {
    Object.assign(this, doc);
    this._id = (doc && doc._id) || '507f1f77bcf86cd799439012';
  });

  // Instance methods via prototype
  Post.prototype.save = function (..._args: any[]) {
    return Promise.resolve(this);
  };
  Post.prototype.populate = function (..._args: any[]) {
    return Promise.resolve(this);
  };

  // Static methods used by service
  Post.findById = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439012',
        title: 'Test Post'
      }),
    }),
    session: jest.fn().mockResolvedValue({
      _id: '507f1f77bcf86cd799439012',
      title: 'Test Post'
    }),
  });
  Post.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            session: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    session: jest.fn().mockResolvedValue([]),
  });
  Post.findByIdAndUpdate = jest.fn().mockResolvedValue({});
  Post.countDocuments = jest.fn().mockReturnValue({
    session: jest.fn().mockResolvedValue(0),
  });
  Post.insertMany = jest.fn();
  Post.aggregate = jest.fn();

  return {
    __esModule: true,
    Post,
  };
});

jest.mock('../../../models/Category', () => ({
  Category: {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockReturnValue({
      session: jest.fn().mockResolvedValue([]),
    }),
    bulkWrite: jest.fn(),
  },
}));

jest.mock('../../../models/Like', () => {
  // Allow tests to override Like.prototype.save behavior
  let likeSaveImpl: any = jest.fn().mockResolvedValue({});

  const Like: any = jest.fn(function (this: any, doc: any) {
    Object.assign(this, doc);
  });

  Like.prototype.save = function (...args: any[]) {
    return likeSaveImpl(...args);
  };

  Like.findOne = jest.fn().mockReturnValue({
    session: jest.fn().mockResolvedValue({ _id: 'like123', userId: 'user1', postId: '507f1f77bcf86cd799439012' }),
  });
  Like.deleteOne = jest.fn().mockReturnValue({
    session: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  });
  Like.create = jest.fn().mockResolvedValue({});
  Like.setSaveImpl = (fn: any) => {
    likeSaveImpl = fn;
  };

  return { __esModule: true, Like };
});

jest.mock('../../../utils/logger');
jest.mock('../../../utils/scoreCalculator', () => ({
  ScoreCalculator: {
    calculateScore: jest.fn().mockReturnValue({
      relevanceScore: 1.5,
      freshnessScore: 0.8,
      finalScore: 2.3,
      algorithm: 'base',
      ageInHours: 12,
    }),
  },
}));

import { PostService, CreatePostData } from '../../../services/PostService';
import { postErrorMessages } from '../../../utils/errorMessages';
import mongoose from 'mongoose';

// Import mocked modules
import { Post } from '../../../models/Post';
import { Category } from '../../../models/Category';
import { Like } from '../../../models/Like';
import { SortOption, SortOrder } from '../../../types/scoring';

const MockedPost = Post as jest.MockedFunction<any> & {
  findById: jest.MockedFunction<any>;
  find: jest.MockedFunction<any>;
  findByIdAndUpdate: jest.MockedFunction<any>;
  countDocuments: jest.MockedFunction<any>;
  insertMany: jest.MockedFunction<any>;
  aggregate: jest.MockedFunction<any>;
};

const MockedCategory = Category as jest.Mocked<typeof Category>;
const MockedLike = Like as any;
const setLikeSaveImpl = (fn: any) => (MockedLike as any).setSaveImpl(fn);

describe('PostService', () => {
  let postService: PostService;

  const session = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
    
    postService = new PostService();
    process.env.NODE_ENV = 'test';
    // Default Like.save to resolve successfully
    setLikeSaveImpl(jest.fn().mockResolvedValue({}));
  });

  describe('createPost', () => {
    it('should create a post successfully', async () => {
      const postData: CreatePostData = {
        title: 'Test Post',
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439011',
        authorId: 'user123',
      };

      const mockCategoryData = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Technology',
        isActive: true,
      };

      MockedCategory.findById.mockResolvedValue(mockCategoryData);
      MockedCategory.findByIdAndUpdate.mockResolvedValue({});

      const result = await postService.createPost(postData);

      expect(MockedCategory.findById).toHaveBeenCalledWith(postData.categoryId);
      expect(MockedCategory.findByIdAndUpdate).toHaveBeenCalledWith(
        postData.categoryId,
        { $inc: { postCount: 1 } },
        { session }
      );
      // Ensure instance methods were available
      expect((result as any).save).toBeDefined();
      expect((result as any).populate).toBeDefined();
      expect(result).toBeDefined();
    });

    it('should throw error if category does not exist', async () => {
      const postData: CreatePostData = {
        title: 'Test Post',
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439011',
        authorId: 'user123',
      };

      MockedCategory.findById.mockResolvedValue(null);

      await expect(postService.createPost(postData)).rejects.toThrow(
        postErrorMessages.CATEGORY_NOT_EXISTS
      );
    });

    it('should throw error if category is not active', async () => {
      const postData: CreatePostData = {
        title: 'Test Post',
        content: 'Test content',
        categoryId: '507f1f77bcf86cd799439011',
        authorId: 'user123',
      };

      const mockInactiveCategory = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Technology',
        isActive: false,
      };

      MockedCategory.findById.mockResolvedValue(mockInactiveCategory);

      await expect(postService.createPost(postData)).rejects.toThrow(
        postErrorMessages.CATEGORY_NOT_ACTIVE
      );
    });
  });

  describe('getPostById', () => {
    it('should return post when found', async () => {
      const postId = '507f1f77bcf86cd799439012';
      const mockPostData = {
        _id: postId,
        title: 'Test Post',
        content: 'Test content',
      };

      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockPostData),
      };
      MockedPost.findById.mockReturnValue(mockQuery as any);

      const result = await postService.getPostById(postId);

      expect(MockedPost.findById).toHaveBeenCalledWith(postId);
      expect(result).toEqual(mockPostData);
    });

    it('should throw error when post not found', async () => {
      const mockQuery = {
        populate: jest.fn().mockResolvedValue(null),
      };
      MockedPost.findById.mockReturnValue(mockQuery as any);

      await expect(postService.getPostById('nonexistent')).rejects.toThrow(
        postErrorMessages.POST_NOT_FOUND
      );
    });
  });

  describe('getPosts', () => {
    it('should return posts with pagination', async () => {
      const mockPosts = [
        {
          _id: '1',
          title: 'Post 1',
          likeCount: 10,
          createdAt: new Date(),
          categoryId: {
            _id: 'cat1',
            name: 'Technology',
            description: 'Tech posts'
          }
        },
      ];

      const mockCountResult = [{ total: 1 }];

      // Mock aggregation pipeline for posts and count
      MockedPost.aggregate
        .mockResolvedValueOnce(mockPosts) // First call for posts
        .mockResolvedValueOnce(mockCountResult); // Second call for count

      const result = await postService.getPosts({}, { page: 1, limit: 10 });

      expect(result.posts).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(MockedPost.aggregate).toHaveBeenCalledTimes(2);
    });

    it('should support score-based sort without crashing', async () => {
      const mockPosts = [
        {
          _id: '1',
          title: 'Score Post',
          likeCount: 5,
          score: 10,
          createdAt: new Date(),
          categoryId: {
            _id: 'cat1',
            name: 'Technology',
            description: 'Tech posts'
          }
        },
      ];

      const mockCountResult = [{ total: 1 }];

      // Mock aggregation pipeline for posts and count
      MockedPost.aggregate
        .mockResolvedValueOnce(mockPosts) // First call for posts
        .mockResolvedValueOnce(mockCountResult); // Second call for count

      const result = await postService.getPosts(
        { sortBy: SortOption.RELEVANCE, order: SortOrder.DESC },
        { page: 1, limit: 10 }
      );

      expect(result.posts[0]).toEqual({
        _id: '1',
        title: 'Score Post',
        likeCount: 5,
        score: 10,
        createdAt: expect.any(Date),
        categoryId: {
          _id: 'cat1',
          name: 'Technology',
          description: 'Tech posts'
        }
      });
    });

    it('should filter posts by categoryId', async () => {
      const categoryId = '507f1f77bcf86cd799439011';
      const mockPosts = [
        {
          _id: '1',
          title: 'Category Post',
          categoryId: {
            _id: categoryId,
            name: 'Technology',
            description: 'Tech posts'
          }
        },
      ];

      const mockCountResult = [{ total: 1 }];

      MockedPost.aggregate
        .mockResolvedValueOnce(mockPosts)
        .mockResolvedValueOnce(mockCountResult);

      const result = await postService.getPosts(
        { categoryId },
        { page: 1, limit: 10 }
      );

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].categoryId._id).toBe(categoryId);
      expect(MockedPost.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              categoryId: expect.any(Object) // ObjectId
            })
          })
        ])
      );
    });
  });

  describe('likePost', () => {
    it('should like a post successfully', async () => {
      const postId = '507f1f77bcf86cd799439012';
      const userId = 'user1';

      // Mock the session-based findById call (first call in likePost)
      const mockSessionQuery = {
        session: jest.fn().mockResolvedValue({
          _id: postId,
          likeCount: 0,
          save: jest.fn().mockResolvedValue({ _id: postId, likeCount: 1 })
        })
      };
      MockedPost.findById.mockReturnValueOnce(mockSessionQuery);

      // Mock Like.findOne.session() to return null (no existing like)
      const mockLikeQuery = {
        session: jest.fn().mockResolvedValue(null)
      };
      MockedLike.findOne.mockReturnValue(mockLikeQuery);

      // Mock the second Post.findById.session() call (for updating like count)
      const mockSecondSessionQuery = {
        session: jest.fn().mockResolvedValue({
          _id: postId,
          likeCount: 0,
          save: jest.fn().mockResolvedValue({ _id: postId, likeCount: 1 })
        })
      };
      MockedPost.findById.mockReturnValueOnce(mockSecondSessionQuery);

      // Mock the final populated result
      const populatedPost = {
        _id: postId,
        likeCount: 1,
        categoryId: { _id: 'cat1', name: 'Technology' }
      };
      
      // Mock the query chain for the final populate call
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(populatedPost)
        })
      };
      
      // For the final findById call (with populate and session)
      MockedPost.findById.mockReturnValueOnce(mockQuery as any);

      const result = await postService.likePost(userId, postId);

      expect(result.liked).toBe(true);
      expect(result.likeCount).toBe(1);
    });

    it('should fail if already liked', async () => {
      const postId = '507f1f77bcf86cd799439012';
      const userId = 'user1';

      // Mock the session-based findById call (first call in likePost)
      const mockSessionQuery = {
        session: jest.fn().mockResolvedValue({ _id: postId })
      };
      MockedPost.findById.mockReturnValueOnce(mockSessionQuery);
      
      // Mock Like.findOne.session() to return an existing like
      const mockLikeQuery = {
        session: jest.fn().mockResolvedValue({ _id: 'like123', userId, postId })
      };
      MockedLike.findOne.mockReturnValue(mockLikeQuery);

      await expect(postService.likePost(userId, postId)).rejects.toThrow(
        postErrorMessages.POST_ALREADY_LIKED
      );
    });
  });

  describe('unlikePost', () => {
    it('should unlike a post successfully', async () => {
      const postId = '507f1f77bcf86cd799439012';
      const userId = 'user1';

      // Mock the session-based findById call (first call in unlikePost)
      const mockSessionQuery = {
        session: jest.fn().mockResolvedValue({
          _id: postId,
          likeCount: 1,
          save: jest.fn().mockResolvedValue({ _id: postId, likeCount: 0 })
        })
      };
      MockedPost.findById.mockReturnValueOnce(mockSessionQuery);

      // Mock Like.findOne.session() call
      const mockLikeQuery = {
        session: jest.fn().mockResolvedValue({ _id: 'like123' })
      };
      MockedLike.findOne.mockReturnValue(mockLikeQuery);

      // Mock Like.deleteOne.session() call
      const mockDeleteQuery = {
        session: jest.fn().mockResolvedValue({ deletedCount: 1 })
      };
      MockedLike.deleteOne.mockReturnValue(mockDeleteQuery);

      // Mock the second Post.findById.session() call (for updating like count)
      const mockSecondSessionQuery = {
        session: jest.fn().mockResolvedValue({
          _id: postId,
          likeCount: 1,
          save: jest.fn().mockResolvedValue({ _id: postId, likeCount: 0 })
        })
      };
      MockedPost.findById.mockReturnValueOnce(mockSecondSessionQuery);

      // Mock the final populated result
      const populatedPost = {
        _id: postId,
        likeCount: 0,
        categoryId: { _id: 'cat1', name: 'Technology' }
      };
      
      // Mock the query chain for the final populate call
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(populatedPost)
        })
      };

      // For the final findById call (with populate and session)
      MockedPost.findById.mockReturnValueOnce(mockQuery as any);

      const result = await postService.unlikePost(userId, postId);

      expect(result.liked).toBe(false);
      expect(result.likeCount).toBe(0);
    });

    it('should clamp negative likeCount to zero', async () => {
      const postId = '507f1f77bcf86cd799439012';
      const userId = 'user1';

      // Mock the session-based findById call (first call in unlikePost)
      const mockSessionQuery = {
        session: jest.fn().mockResolvedValue({
          _id: postId,
          likeCount: 0, // Start with 0, so decrementing would make it negative
          save: jest.fn().mockResolvedValue({ _id: postId, likeCount: 0 })
        })
      };
      MockedPost.findById.mockReturnValueOnce(mockSessionQuery);

      // Mock Like.findOne.session() call
      const mockLikeQuery = {
        session: jest.fn().mockResolvedValue({ _id: 'like123' })
      };
      MockedLike.findOne.mockReturnValue(mockLikeQuery);

      // Mock Like.deleteOne.session() call
      const mockDeleteQuery = {
        session: jest.fn().mockResolvedValue({ deletedCount: 1 })
      };
      MockedLike.deleteOne.mockReturnValue(mockDeleteQuery);

      // Mock the second Post.findById.session() call (for updating like count)
      const mockSecondSessionQuery = {
        session: jest.fn().mockResolvedValue({
          _id: postId,
          likeCount: 0, // Start with 0, will be clamped to 0
          save: jest.fn().mockResolvedValue({ _id: postId, likeCount: 0 })
        })
      };
      MockedPost.findById.mockReturnValueOnce(mockSecondSessionQuery);

      // Mock the final populated result (second findById call)
      const populatedPost = {
        _id: postId,
        likeCount: 0,
        categoryId: { _id: 'cat1', name: 'Technology' }
      };
      
      // Mock the query chain for the final populate call
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          session: jest.fn().mockResolvedValue(populatedPost)
        })
      };

      // For the final findById call (with populate and session)
      MockedPost.findById.mockReturnValueOnce(mockQuery as any);

      const result = await postService.unlikePost(userId, postId);

      expect(result.likeCount).toBe(0);
    });

    it('should fail if not liked yet', async () => {
      const postId = '507f1f77bcf86cd799439012';
      const userId = 'user1';

      // Mock the session-based findById call (first call in unlikePost)
      const mockSessionQuery = {
        session: jest.fn().mockResolvedValue({ _id: postId })
      };
      MockedPost.findById.mockReturnValueOnce(mockSessionQuery);
      
      // Mock Like.findOne.session() call to return null
      const mockLikeQuery = {
        session: jest.fn().mockResolvedValue(null)
      };
      MockedLike.findOne.mockReturnValue(mockLikeQuery);

      await expect(postService.unlikePost(userId, postId)).rejects.toThrow(
        postErrorMessages.POST_NOT_LIKED
      );
    });
  });

  describe('bulkCreatePosts', () => {
    it('should fail when no posts provided', async () => {
      await expect(postService.bulkCreatePosts([], 'user123')).rejects.toThrow(
        postErrorMessages.BULK_NO_POSTS_PROVIDED
      );
    });

    it('should create valid posts and skip invalid ones', async () => {
      const authorId = 'user123';
      const validCategoryId = '507f1f77bcf86cd799439011';

      const postsData = [
        { title: 'Valid 1', content: 'C1', categoryId: validCategoryId },
        { title: '', content: 'Missing title', categoryId: validCategoryId }, // invalid - missing title
        { title: 'Invalid Cat', content: 'C3', categoryId: 'invalid' }, // invalid ObjectId
        { title: 'Valid 2', content: 'C4', categoryId: validCategoryId },
      ];

      // Category validation returns the valid active category
      (Category.find as jest.Mock).mockResolvedValue([
        { _id: validCategoryId, name: 'Tech', isActive: true },
      ]);

      // Insert only valid posts (simulate two successful inserts)
      const inserted = [
        {
          _id: '507f1f77bcf86cd799439100',
          title: 'Valid 1',
          categoryId: validCategoryId,
        },
        {
          _id: '507f1f77bcf86cd799439101',
          title: 'Valid 2',
          categoryId: validCategoryId,
        },
      ];
      MockedPost.insertMany.mockResolvedValue(inserted);

      // Populate inserted posts
      const populated = [
        {
          _id: '507f1f77bcf86cd799439100',
          title: 'Valid 1',
          categoryId: { _id: validCategoryId, name: 'Tech', isActive: true },
        },
        {
          _id: '507f1f77bcf86cd799439101',
          title: 'Valid 2',
          categoryId: { _id: validCategoryId, name: 'Tech', isActive: true },
        },
      ];
      const findQuery = {
        populate: jest.fn().mockResolvedValue(populated),
      };
      MockedPost.find.mockReturnValue(findQuery as any);

      // Avoid category bulk write by returning no aggregates
      MockedPost.aggregate.mockResolvedValue([]);

      const result = await postService.bulkCreatePosts(postsData, authorId);

      expect(result.successful).toBe(2);
      expect(result.failed).toBeGreaterThan(0);
      expect(result.posts).toHaveLength(2);
      expect(MockedPost.insertMany).toHaveBeenCalled();
      // Verify categories were filtered by isActive: true
      expect(Category.find).toHaveBeenCalledWith({
        _id: { $in: [validCategoryId] },
        isActive: true
      });
    });

    it('should reject posts with inactive categories', async () => {
      const authorId = 'user123';
      const inactiveCategoryId = '507f1f77bcf86cd799439011';

      const postsData = [
        { title: 'Post with inactive category', content: 'Content here', categoryId: inactiveCategoryId },
      ];

      // Category validation returns empty array (no active categories found)
      (Category.find as jest.Mock).mockResolvedValue([]);

      const result = await postService.bulkCreatePosts(postsData, authorId);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.posts).toHaveLength(0);
      expect(MockedPost.insertMany).not.toHaveBeenCalled();
    });
  });
});
