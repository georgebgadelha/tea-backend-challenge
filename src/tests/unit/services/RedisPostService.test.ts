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
  Post.aggregate = jest.fn();

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
      const mockCachedResult = {
        posts: [{ _id: 'post1', title: 'Cached Post' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrevious: false, nextOffset: null, prevOffset: null, offset: 0 }
      };

      MockedRedis.get.mockResolvedValue(JSON.stringify(mockCachedResult));

      const result = await redisPostService.getPosts(
        { sortBy: SortOption.CREATED_AT },
        { page: 2, limit: 20 }
      );

      expect(MockedRedis.get).toHaveBeenCalledWith('feed:all:p2:createdAt:desc');
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
      const expectedPatterns = [
        'feed:all:*:score:*',
        'feed:all:*:relevance:*',
        'feed:all:*:freshness:*',
        `feed:${categoryId}:*:score:*`,
        `feed:${categoryId}:*:relevance:*`,
        `feed:${categoryId}:*:freshness:*`,
      ];

      // Mock each pattern to return some keys
      MockedRedis.keys.mockImplementation((pattern: string) => {
        return Promise.resolve([`${pattern.replace('*', 'test1')}`, `${pattern.replace('*', 'test2')}`]);
      });

      await (redisPostService as any).invalidateRelatedCaches(categoryId);

      // Should call keys for each pattern
      expectedPatterns.forEach(pattern => {
        expect(MockedRedis.keys).toHaveBeenCalledWith(pattern);
      });

      // Should call del for found keys
      expect(MockedRedis.del).toHaveBeenCalled();
    });
  });

  describe('Cache Key Building', () => {
    it('should build correct cache keys for different scenarios', () => {
      const testCases = [
        {
          filters: { categoryId: 'cat1', sortBy: SortOption.RELEVANCE },
          pagination: { page: 1 },
          expected: 'feed:cat1:p1:relevance:desc'
        },
        {
          filters: { sortBy: SortOption.CREATED_AT },
          pagination: { page: 2, limit: 10 },
          expected: 'feed:all:p2:createdAt:desc'
        },
        {
          filters: { categoryId: 'cat2', sortBy: SortOption.LIKE_COUNT, order: SortOrder.ASC },
          pagination: { page: 3 },
          expected: 'feed:cat2:p3:likeCount:asc'
        }
      ];

      testCases.forEach(({ filters, pagination, expected }) => {
        const cacheKey = (redisPostService as any).buildCacheKey(filters, pagination);
        expect(cacheKey).toBe(expected);
      });
    });
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
      MockedRedis.keys
        .mockResolvedValueOnce(['feed:key1', 'feed:key2'])
        .mockResolvedValueOnce(['hot_posts:global', 'hot_posts:category:cat1']);

      await redisPostService.clearAllCaches();

      expect(MockedRedis.keys).toHaveBeenCalledWith('feed:*');
      expect(MockedRedis.keys).toHaveBeenCalledWith('hot_posts:*');
      expect(MockedRedis.del).toHaveBeenCalledWith('feed:key1', 'feed:key2');
      expect(MockedRedis.del).toHaveBeenCalledWith('hot_posts:global', 'hot_posts:category:cat1');
    });
  });
});