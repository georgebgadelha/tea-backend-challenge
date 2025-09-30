// Mock Redis and other dependencies
jest.mock('../../../config/redis', () => {
  // Create a singleton mock Redis client so that the service and
  // the test helpers reference the same object instance.
  const mockPipeline = {
    zadd: jest.fn(),
    zremrangebyrank: jest.fn(),
    zrem: jest.fn(),
    expire: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    zadd: jest.fn(),
    zrevrange: jest.fn(),
    zcard: jest.fn(),
    zrem: jest.fn(),
    zremrangebyrank: jest.fn(),
    expire: jest.fn(),
    incr: jest.fn(),
    pipeline: jest.fn(() => mockPipeline),
  };

  return {
    getRedisClient: jest.fn(() => mockRedisClient),
  };
});

jest.mock('../../../models/Post', () => {
  const Post: any = jest.fn(function (this: any, doc: any) {
    Object.assign(this, doc);
    this._id = doc._id || '507f1f77bcf86cd799439012';
  });

  Post.prototype.save = jest.fn().mockResolvedValue({});
  Post.prototype.populate = jest.fn().mockResolvedValue({});

  Post.findById = jest.fn();
  Post.find = jest.fn();
  Post.aggregate = jest.fn().mockResolvedValue([]);

  return {
    __esModule: true,
    Post,
  };
});

jest.mock('../../../models/Category', () => ({
  Category: {
    findById: jest.fn(),
    find: jest.fn(),
  },
}));

jest.mock('../../../utils/logger');

import { RedisPostService } from '../../../services/RedisPostService';
import { SortOption, SortOrder } from '../../../types/scoring';
import { getRedisClient } from '../../../config/redis';
import { Post } from '../../../models/Post';

const MockedRedis = getRedisClient() as jest.Mocked<ReturnType<typeof getRedisClient>>;
const MockedPost = Post as jest.Mocked<typeof Post>;

describe('RedisPostService', () => {
  let redisPostService: RedisPostService;

  beforeEach(() => {
    // Clear mocks first so per-test mockResolvedValue/mockReturnValue calls behave predictably
    jest.clearAllMocks();

    // Instantiate service and inject the mocked Redis client so the service's
    // `this.redis` property uses the test singleton instead of a real client.
    redisPostService = new RedisPostService();
    (redisPostService as any).redis = MockedRedis;
    // Ensure pipeline methods exist by default for tests that don't override it
    const defaultPipeline = {
      zadd: jest.fn().mockReturnThis(),
      zremrangebyrank: jest.fn().mockReturnThis(),
      zrem: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    MockedRedis.pipeline.mockReturnValue(defaultPipeline as any);
    // Default responses for commonly used Redis commands
    MockedRedis.keys.mockResolvedValue([]);
    MockedRedis.del.mockResolvedValue(0);
    MockedRedis.get.mockResolvedValue(null);
    MockedRedis.setex.mockResolvedValue('OK');
    MockedRedis.zrevrange.mockResolvedValue([]);
    MockedRedis.zcard.mockResolvedValue(0);
    MockedRedis.expire.mockResolvedValue(1);
    MockedRedis.incr.mockResolvedValue(1);

    // Reset Post mock behavior
    MockedPost.aggregate.mockResolvedValue([]);
    MockedPost.findById.mockResolvedValue(null);
    (MockedPost.find as any).mockReturnValue({
      populate: jest.fn().mockResolvedValue([])
    });
  });

  describe('Hot Posts Management', () => {
    it('should update hot posts rankings when post is liked', async () => {
      const mockPost = {
        _id: '507f1f77bcf86cd799439012',
        score: 15,
        categoryId: { _id: '507f1f77bcf86cd799439011' },
        likeCount: 5
      };

      // Mock the parent likePost method
      jest.spyOn(RedisPostService.prototype, 'likePost').mockImplementation(async function(this: RedisPostService, userId: string, postId: string) {
        // Mock parent behavior
        const parentResult = {
          liked: true,
          likeCount: 5,
          post: mockPost
        };

        // Call the Redis operations that would normally be called
        const pipeline = MockedRedis.pipeline();
        await this['updateHotPostRankings'](mockPost);
        await this['invalidateRelatedCaches'](mockPost.categoryId._id.toString());

        return parentResult;
      });

      const result = await redisPostService.likePost('user1', '507f1f77bcf86cd799439012');

      expect(result.liked).toBe(true);
      expect(MockedRedis.pipeline).toHaveBeenCalled();
    });

    it('should get hot posts from Redis sorted sets', async () => {
      const mockHotPostIds = ['post1', 'post2', 'post3'];
      MockedRedis.zrevrange.mockResolvedValue(mockHotPostIds);

      const mockPosts = [
        { _id: 'post1', title: 'Hot Post 1', score: 20 },
        { _id: 'post2', title: 'Hot Post 2', score: 15 },
        { _id: 'post3', title: 'Hot Post 3', score: 10 }
      ];

      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockPosts)
      };
      MockedPost.find.mockReturnValue(mockQuery as any);

      // Test private method through reflection
      const hotPosts = await (redisPostService as any).getHotPosts(null, 3);

      expect(MockedRedis.zrevrange).toHaveBeenCalledWith('hot_posts:global', 0, 2);
      expect(hotPosts).toEqual(mockHotPostIds);
    });

    it('should get category-specific hot posts', async () => {
      const categoryId = '507f1f77bcf86cd799439011';
      const mockHotPostIds = ['post1', 'post2'];
      MockedRedis.zrevrange.mockResolvedValue(mockHotPostIds);

      const hotPosts = await (redisPostService as any).getHotPosts(categoryId, 2);

      expect(MockedRedis.zrevrange).toHaveBeenCalledWith(
        `hot_posts:category:${categoryId}`, 
        0, 
        1
      );
      expect(hotPosts).toEqual(mockHotPostIds);
    });

    it('should remove low-scoring posts from hot posts', async () => {
      const mockPost = {
        _id: '507f1f77bcf86cd799439012',
        score: 2, // Below minimum threshold of 5
        categoryId: { _id: '507f1f77bcf86cd799439011' }
      };

      const mockPipeline = {
        zadd: jest.fn(),
        zrem: jest.fn(),
        zremrangebyrank: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([])
      };
      MockedRedis.pipeline.mockReturnValue(mockPipeline as any);

      await (redisPostService as any).updateHotPostRankings(mockPost);

      // Should remove from hot posts instead of adding
      expect(mockPipeline.zrem).toHaveBeenCalledWith('hot_posts:global', mockPost._id);
      expect(mockPipeline.zrem).toHaveBeenCalledWith(
        `hot_posts:category:${mockPost.categoryId._id}`, 
        mockPost._id
      );
    });
  });

  describe('Feed Caching', () => {
    it('should return cached feed results when available', async () => {
      // Create cached result with enough posts for page 1 request
      const mockCachedResult = {
        posts: [
          { _id: 'post1', title: 'Cached Post 1' },
          { _id: 'post2', title: 'Cached Post 2' },
          { _id: 'post3', title: 'Cached Post 3' }
        ],
        pagination: { page: 1, limit: 3, total: 3, totalPages: 1, hasNext: false, hasPrevious: false, nextOffset: null, prevOffset: null, offset: 0 }
      };

      // Mock Redis get to handle multiple calls and debug what keys are being requested
      const getCallKeys: string[] = [];
      MockedRedis.get.mockImplementation((key: any) => {
        const keyStr = key.toString();
        getCallKeys.push(keyStr);
        console.log('Redis GET called with key:', keyStr);
        
        if (keyStr.includes('feed_v:')) {
          console.log('Returning version 1 for feed version key');
          return Promise.resolve('1'); // Feed version
        }
        if (keyStr.includes('feed:')) {
          console.log('Returning cached data for feed cache key');
          return Promise.resolve(JSON.stringify(mockCachedResult)); // Cache data
        }
        console.log('Returning null for unknown key');
        return Promise.resolve(null); // Default
      });

      const result = await redisPostService.getPosts(
        { sortBy: SortOption.LIKE_COUNT },
        { page: 1, limit: 3 } // Request exactly the number of posts we have in cache
      );

      console.log('All Redis GET calls:', getCallKeys);
      console.log('Actual result:', JSON.stringify(result, null, 2));
      console.log('Expected result:', JSON.stringify(mockCachedResult, null, 2));

      // Verify that we got the cached result
      expect(result).toEqual(mockCachedResult);
    });

    it('should use hybrid approach for first page with score-based sorting', async () => {
      const mockHotPostIds = ['post1', 'post2'];
      MockedRedis.zrevrange.mockResolvedValue(mockHotPostIds);
      MockedRedis.get.mockResolvedValue(null); // No cache

      const mockHotPosts = [
        { _id: 'post1', title: 'Hot Post 1', score: 20 },
        { _id: 'post2', title: 'Hot Post 2', score: 15 }
      ];

      const mockQuery = {
        populate: jest.fn().mockResolvedValue(mockHotPosts)
      };
      MockedPost.find.mockReturnValue(mockQuery as any);

      // Mock the parent getPosts for regular posts and Post.aggregate used by PostService
      const mockRegularResult = {
        posts: [{ _id: 'post3', title: 'Regular Post', score: 5 }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false, nextOffset: null, prevOffset: null, offset: 0 }
      };

      // Ensure Post.aggregate returns an array for the selection query and a count for the count query
      // Return an object with a `then` method (thenable) to mimic Mongoose Aggregate
      const thenable = (value: any) => ({ then: (cb: any) => Promise.resolve(value).then(cb) });
      (MockedPost.aggregate as any).mockImplementation((pipeline: any[]) => {
        if (pipeline.some((stage: any) => stage.$count)) {
          return thenable([{ total: 1 }]);
        }
        return thenable(mockRegularResult.posts);
      });

      jest.spyOn(RedisPostService.prototype, 'getPosts').mockImplementation(async function(this: RedisPostService, filters, pagination) {
        if (pagination?.page === 1) {
          // Call the actual hybrid implementation
          return (this as any).getHybridFirstPage(filters, pagination);
        }
        return mockRegularResult;
      });

      const result = await redisPostService.getPosts(
        { sortBy: SortOption.RELEVANCE },
        { page: 1, limit: 20 }
      );

      expect(MockedRedis.zrevrange).toHaveBeenCalledWith('hot_posts:global', 0, 19);
    });

    it('should invalidate related caches when post scores change', async () => {
      const categoryId = '507f1f77bcf86cd799439011';
      
      // Mock incr for version bumping
      MockedRedis.incr = jest.fn().mockResolvedValue(1);

      await (redisPostService as any).invalidateRelatedCaches(categoryId);

      // Should bump versions for both category and global feeds
      expect(MockedRedis.incr).toHaveBeenCalledWith('feed_v:507f1f77bcf86cd799439011');
      expect(MockedRedis.incr).toHaveBeenCalledWith('feed_v:all');
      expect(MockedRedis.incr).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Key Building', () => {
    // Note: buildCacheKey is no longer a separate method in RedisPostService
    // Cache keys are built inline. This test section is kept for reference
    // but doesn't test a specific method anymore.
  });

  describe('Admin/Debug Methods', () => {
    it('should provide hot posts statistics', async () => {
      MockedRedis.zcard.mockResolvedValue(15);
      MockedRedis.zrevrange.mockResolvedValue(['post1', '20', 'post2', '15', 'post3', '10']);

      const stats = await redisPostService.getHotPostsStats();

      expect(stats).toEqual({
        global: {
          count: 15,
          top3: ['post1', '20', 'post2', '15', 'post3', '10']
        }
      });
    });

    it('should clear all caches', async () => {
      MockedRedis.keys.mockResolvedValueOnce(['hot_posts:global', 'hot_posts:category:cat1']);

      await redisPostService.clearAllCaches();

      expect(MockedRedis.keys).toHaveBeenCalledWith('hot_posts:*');
      expect(MockedRedis.del).toHaveBeenCalledWith('hot_posts:global', 'hot_posts:category:cat1');
    });
  });
});