import {
  PostService,
  PostFilters,
  PaginationOptions,
  PostsResult,
  LikeResult,
} from './PostService';
import { getRedisClient } from '../config/redis';
import { Post } from '../models/Post';
import { logger } from '../utils/logger';
import { postErrorMessages } from '../utils/errorMessages';
import { SortOption } from '../types/scoring';
import mongoose from 'mongoose';

/**
 * RedisPostService extends PostService to integrate Redis caching and ranking.
 * The reason behind redis own class is to keep PostService clean and focused on DB operations.
 * Also known as separation of concerns.
 */
export class RedisPostService extends PostService {
  private redis = getRedisClient();

  private readonly REDIS_KEYS = {
    HOT_POSTS_GLOBAL: 'hot_posts:global',
    HOT_POSTS_CATEGORY: (categoryId: string) =>
      `hot_posts:category:${categoryId}`,
    FEED_VERSION: (categoryId: string | null) => `feed_v:${categoryId || 'all'}`,
    // NOTE: cache key intentionally does NOT include page. We cache a "window"
    // (typically page 1) and slice it for subsequent page requests when possible.
    FEED_CACHE: (
      categoryId: string | null,
      version: string | number,
      sortBy: string,
      order: string
    ) => `feed:${categoryId || 'all'}:v${version}:${sortBy}:${order}`,
  };

  private readonly CONFIG = {
    MAX_HOT_POSTS_GLOBAL: 100,
    MAX_HOT_POSTS_PER_CATEGORY: 50,

    // Cache TTLs
    FEED_CACHE_TTL: 300, // 5 minutes
    HOT_POSTS_TTL: 3600, // 1 hour (for cleanup)

    // Score thresholds
    MIN_HOT_POST_SCORE: 3, // Minimum score to be considered "hot"
  };


  private async getFeedVersion(categoryId: string | null): Promise<string> {
    const key = this.REDIS_KEYS.FEED_VERSION(categoryId);
    try {
      const v = await this.redis.get(key);
      if (v) return v;
      await this.redis.set(key, '1');
      return '1';
    } catch (err) {
      logger.debug('Failed to read feed version from redis, defaulting to 1', { err });
      return '1';
    }
  }

  private async bumpFeedVersion(categoryId: string | null): Promise<void> {
    const key = this.REDIS_KEYS.FEED_VERSION(categoryId);
    try {
      await this.redis.incr(key);
      logger.info('Bumped feed version', { key });
    } catch (err) {
      logger.error('Failed to bump feed version', { key, err });
    }
  }

  async getPosts(
    filters: PostFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PostsResult> {
  const page = pagination.page || 1;
  const sortBy = filters.sortBy || SortOption.RELEVANCE;

    if (page === 1 && this.isScoreBasedSort(sortBy)) {
      return this.getHybridFirstPage(filters, pagination);
    }

    return this.getCachedPosts(filters, pagination);
  }

  private async getHybridFirstPage(
    filters: PostFilters,
    pagination: PaginationOptions
  ): Promise<PostsResult> {
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));

    try {
      const hotPostIds = await this.getHotPosts(filters.categoryId, limit);

      if (hotPostIds.length >= limit) {
        const hotPosts = await this.populateHotPosts(
          hotPostIds.slice(0, limit)
        );
        return this.buildPostsResult(hotPosts, {
          page: 1,
          limit,
          total: hotPostIds.length,
        });
      }

      // Mix hot posts with regular posts
      const remainingLimit = limit - hotPostIds.length;
      const regularPosts = await this.getRegularPosts(
        filters,
        remainingLimit,
        hotPostIds
      );

      const hotPosts = await this.populateHotPosts(hotPostIds);
      const allPosts = [...hotPosts, ...regularPosts.posts];

      return this.buildPostsResult(allPosts, {
        page: 1,
        limit,
        total: hotPostIds.length + regularPosts.pagination.total,
      });
    } catch (error) {
      logger.error('Hybrid first page failed, fallback to database', { error });
      return super.getPosts(filters, pagination);
    }
  }

  private async getCachedPosts(
    filters: PostFilters,
    pagination: PaginationOptions
  ): Promise<PostsResult> {
    const page = pagination.page || 1;
    const sortBy = filters.sortBy || SortOption.RELEVANCE;
    const order = filters.order || 'desc';
    const categoryIdStr = this.normalizeCategoryId(filters.categoryId);
    const version = await this.getFeedVersion(categoryIdStr);
    const cacheKey = this.REDIS_KEYS.FEED_CACHE(
      categoryIdStr,
      version,
      sortBy,
      order
    );

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Feed cache hit', { cacheKey });
        const parsed: PostsResult = JSON.parse(cached);

        // If a category filter was provided, filter cached posts by category before slicing. 
        // Cached keys are already per-category when a categoryId was used to build the key.
        const requestedLimit = pagination.limit || parsed.pagination.limit || 20;
        const requestedPage = pagination.page || 1;
        let availablePosts = parsed.posts;
        if (filters.categoryId) {
          const requestedCat = this.normalizeCategoryId(filters.categoryId);
          availablePosts = parsed.posts.filter((p: any) =>
            this.normalizeCategoryId((p as any).categoryId) === requestedCat
          );
        }

        // Compute slice for requested page based on offset
        const offset = (requestedPage - 1) * requestedLimit;
        if (availablePosts.length >= offset + requestedLimit) {
          const sliced = availablePosts.slice(offset, offset + requestedLimit);
          const total = parsed.pagination.total;
          const totalPages = Math.ceil(total / requestedLimit);

          return {
            posts: sliced,
            pagination: {
              page: requestedPage,
              limit: requestedLimit,
              offset,
              total,
              totalPages,
              hasNext: requestedPage < totalPages,
              hasPrevious: requestedPage > 1,
              nextOffset: requestedPage < totalPages ? offset + requestedLimit : null,
              prevOffset: requestedPage > 1 ? Math.max(0, offset - requestedLimit) : null,
            },
          };
        }
      }

      logger.info('Feed cache miss', { cacheKey });
      const result = await super.getPosts(filters, pagination);

      await this.cacheFeedResult(cacheKey, result);

      return result;
    } catch (error) {
      logger.error('Cache operation failed, fallback to database', { error });
      return super.getPosts(filters, pagination);
    }
  }

  async likePost(userId: string, postId: string): Promise<LikeResult> {
    const userLikeKey = `user_like:${postId}:${userId}`;

    try {
  const exists = await this.redis.get(userLikeKey);
  logger.debug('Redis GET', { key: userLikeKey, exists });
      if (exists) {
        throw new Error(postErrorMessages.POST_ALREADY_LIKED);
      }
    } catch (err: any) {
      if (err && err.message === postErrorMessages.POST_ALREADY_LIKED) {
        throw err;
      }
      logger.debug('Failed to check user_like key in Redis (non-fatal), falling back to DB', { err });
    }

    const result = await super.likePost(userId, postId);

    try {
  const setRes = await this.redis.set(userLikeKey, '1');
  logger.debug('Redis SET', { key: userLikeKey, res: setRes });

  await this.updateHotPostRankings(result.post);

  // Bump feed version for the affected category and global feed
  const catId = this.normalizeCategoryId(result.post.categoryId);
  await this.bumpFeedVersion(catId);
  await this.bumpFeedVersion(null);

      logger.info('Redis operations completed for like', {
        postId,
        newScore: result.post.score,
      });
    } catch (error) {
      logger.error('Redis operations failed for like', { postId, error });
    }

    return result;
  }

  async unlikePost(userId: string, postId: string): Promise<LikeResult> {
    const userLikeKey = `user_like:${postId}:${userId}`;
    try {
  const exists = await this.redis.get(userLikeKey);
  logger.debug('Redis GET', { key: userLikeKey, exists });
      if (!exists) {
        throw new Error(postErrorMessages.POST_NOT_LIKED);
      }
    } catch (err: any) {
      if (err && err.message === postErrorMessages.POST_NOT_LIKED) {
        throw err;
      }
      logger.debug('Failed to check user_like key in Redis (non-fatal), falling back to DB', { err });
    }
    const result = await super.unlikePost(userId, postId);

    try {
  const delRes = await this.redis.del(userLikeKey);
  logger.debug('Redis DEL', { key: userLikeKey, res: delRes });

  await this.updateHotPostRankings(result.post);

  const catId = this.normalizeCategoryId(result.post.categoryId);
  await this.bumpFeedVersion(catId);
  await this.bumpFeedVersion(null);

      logger.info('Redis operations completed for unlike', {
        postId,
        newScore: result.post.score,
      });
    } catch (error) {
      logger.error('Redis operations failed for unlike', { postId, error });
    }

    return result;
  }

  async createPost(data: any) {
    const post = await super.createPost(data);

    try {
      if (post.score >= this.CONFIG.MIN_HOT_POST_SCORE) {
        await this.updateHotPostRankings(post);
      }

      // Bump feed versions instead of deleting cached keys. This avoids
      // scanning Redis and lets old cache entries expire naturally.
      const catId = this.normalizeCategoryId(post.categoryId);
      await this.bumpFeedVersion(catId);
      await this.bumpFeedVersion(null);

      // Fire-and-forget: refresh a few important feed pages in background.
      // We don't await it here because we don't want to block the HTTP response.
      this.refreshCachesForPost(post).catch((err) =>
        logger.error('Background refresh failed', { err, postId: post._id })
      );

      logger.debug('Redis operations completed for create post', {
        postId: post._id,
      });
    } catch (error) {
      logger.error('Redis operations failed for create post', {
        postId: post._id,
        error,
      });
    }

    return post;
  }

  private async getHotPosts(
    categoryId?: string,
    limit: number = 20
  ): Promise<string[]> {
    const key = categoryId
      ? this.REDIS_KEYS.HOT_POSTS_CATEGORY(categoryId)
      : this.REDIS_KEYS.HOT_POSTS_GLOBAL;

    return this.redis.zrevrange(key, 0, limit - 1);
  }

  private async populateHotPosts(postIds: string[]): Promise<any[]> {
    if (postIds.length === 0) return [];

    const posts = await Post.find({
      _id: { $in: postIds.map((id) => new mongoose.Types.ObjectId(id)) },
    }).populate('categoryId', 'name description');

    const postMap = new Map(posts.map((post) => [post._id.toString(), post]));
    return postIds.map((id) => postMap.get(id)).filter(Boolean);
  }

  private async getRegularPosts(
    filters: PostFilters,
    limit: number,
    excludeIds: string[]
  ): Promise<PostsResult> {
    const modifiedFilters = { ...filters };

    const excludeObjectIds = excludeIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    const result = await super.getPosts(modifiedFilters, {
      page: 1,
      limit: limit * 2,
    });

    const filteredPosts = result.posts
      .filter((post) => !excludeIds.includes(post._id.toString()))
      .slice(0, limit);

    return {
      posts: filteredPosts,
      pagination: {
        ...result.pagination,
        total: Math.max(0, result.pagination.total - excludeIds.length),
      },
    };
  }

  private async updateHotPostRankings(post: any): Promise<void> {
    const postId = post._id.toString();
    const score = post.score || 0;
    const categoryId =
      typeof post.categoryId === 'object'
        ? post.categoryId._id.toString()
        : post.categoryId.toString();

    const pipeline = this.redis.pipeline();

    if (score >= this.CONFIG.MIN_HOT_POST_SCORE) {
      pipeline.zadd(this.REDIS_KEYS.HOT_POSTS_GLOBAL, score, postId);
      pipeline.zremrangebyrank(
        this.REDIS_KEYS.HOT_POSTS_GLOBAL,
        0,
        -(this.CONFIG.MAX_HOT_POSTS_GLOBAL + 1)
      );
    } else {
      pipeline.zrem(this.REDIS_KEYS.HOT_POSTS_GLOBAL, postId);
    }

    const categoryKey = this.REDIS_KEYS.HOT_POSTS_CATEGORY(categoryId);
    if (score >= this.CONFIG.MIN_HOT_POST_SCORE) {
      pipeline.zadd(categoryKey, score, postId);
      pipeline.zremrangebyrank(
        categoryKey,
        0,
        -(this.CONFIG.MAX_HOT_POSTS_PER_CATEGORY + 1)
      );
    } else {
      pipeline.zrem(categoryKey, postId);
    }

    pipeline.expire(
      this.REDIS_KEYS.HOT_POSTS_GLOBAL,
      this.CONFIG.HOT_POSTS_TTL
    );
    pipeline.expire(categoryKey, this.CONFIG.HOT_POSTS_TTL);

  const pipelineRes = await pipeline.exec();
  logger.debug('Redis pipeline exec', { postId, score, categoryId, pipelineRes });

  logger.debug('Hot post rankings updated', { postId, score, categoryId });
  }

  private async invalidateRelatedCaches(categoryId: any): Promise<void> {
    // Lightweight invalidation: bump the version token for the specific
    // category and for the global feed. This avoids scanning Redis keys and
    // massively deleting entries. Old cache entries will become unreachable
    // because the cache key now includes the version token, and they will
    // naturally expire per their TTL.
    const catId = this.normalizeCategoryId(categoryId);
    await this.bumpFeedVersion(catId);
    await this.bumpFeedVersion(null);

    logger.info('Cache version bumped for category and global', { categoryId: catId });
  }

  private async cacheFeedResult(
    cacheKey: string,
    result: PostsResult
  ): Promise<void> {
    const setexRes = await this.redis.setex(
      cacheKey,
      this.CONFIG.FEED_CACHE_TTL,
      JSON.stringify(result)
    );
    logger.debug('Redis SETEX', { cacheKey, res: setexRes });
    logger.debug('Feed result cached', { cacheKey });
  }

  /**
   * Refresh a small, conservative set of feed caches after a post change.
   * Uses a per-scope lock to avoid concurrent rebuilds and pipelines the
   * SETEX calls to minimize roundtrips.
   */
  private async refreshCachesForPost(post: any): Promise<void> {
    const categoryId = this.normalizeCategoryId(post.categoryId) || null;
    const pagination = { page: 1, limit: 20 };
    const sorts = [SortOption.FRESHNESS, SortOption.RELEVANCE];

    const scopes: Array<{ scope: 'all' | 'category'; categoryId: string | null }> = [
      { scope: 'all', categoryId: null },
    ];
    if (categoryId) scopes.push({ scope: 'category', categoryId });

    for (const s of scopes) {
      const lockKey = `refresh_lock:${s.categoryId || 'all'}`;
      try {
  // ioredis expects expiry mode before NX/XX flag: SET key value EX seconds NX
  const lockRes = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
        if (!lockRes) {
          logger.debug('Refresh skipped, lock present', { lockKey });
          continue;
        }

        const pipeline = this.redis.pipeline();

        for (const sort of sorts) {
          const filters: PostFilters = { sortBy: sort } as PostFilters;
          if (s.scope === 'category' && s.categoryId) {
            filters.categoryId = s.categoryId as any;
          }

          const result = await super.getPosts(filters, pagination);

          const version = await this.getFeedVersion(
            this.normalizeCategoryId(filters.categoryId)
          );
          const cacheKey = this.REDIS_KEYS.FEED_CACHE(
            this.normalizeCategoryId(filters.categoryId),
            version,
            sort,
            'desc'
          );

          pipeline.setex(cacheKey, this.CONFIG.FEED_CACHE_TTL, JSON.stringify(result));
        }

  const pipelineRes = await pipeline.exec();
  logger.debug('Refreshed feed caches', { lockKey, pipelineRes });
      } catch (err) {
        logger.error('Error while refreshing feed caches', { err, scope: s });
      }
    }
  }

  // buildCacheKey is no longer needed as a separate function because version is
  // required and fetched async; callers construct the key using getFeedVersion.

  /**
   * Normalize category identifiers into a string id or null.
   * Accepts a plain string, a Mongoose populated object ({ _id, id, ... }),
   * an ObjectId instance, or other values.
   */
  private normalizeCategoryId(categoryId: any): string | null {
    if (!categoryId) return null;
    if (typeof categoryId === 'string') return categoryId;
    // Mongoose populated document
    if (typeof categoryId === 'object') {
      if ((categoryId as any)._id) return (categoryId as any)._id.toString();
      if ((categoryId as any).id) return (categoryId as any).id.toString();
      try {
        // covers ObjectId or similar
        return categoryId.toString();
      } catch (e) {
        return null;
      }
    }
    return String(categoryId);
  }

  private buildPostsResult(
    posts: any[],
    paginationInfo: { page: number; limit: number; total: number }
  ): PostsResult {
    const { page, limit, total } = paginationInfo;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    return {
      posts,
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
        nextOffset: page < totalPages ? offset + limit : null,
        prevOffset: page > 1 ? Math.max(0, offset - limit) : null,
      },
    };
  }

  private isScoreBasedSort(sortBy?: SortOption): boolean {
    return [SortOption.RELEVANCE, SortOption.FRESHNESS].includes(
      sortBy as SortOption
    );
  }

  // Admin/Debug methods
  async getHotPostsStats(): Promise<any> {
    const globalCount = await this.redis.zcard(
      this.REDIS_KEYS.HOT_POSTS_GLOBAL
    );
    const globalTop3 = await this.redis.zrevrange(
      this.REDIS_KEYS.HOT_POSTS_GLOBAL,
      0,
      2,
      'WITHSCORES'
    );

    return {
      global: {
        count: globalCount,
        top3: globalTop3,
      },
    };
  }

  async clearAllCaches(): Promise<void> {
    // Admin-only: try to clear hot posts and feed cache keys.
    // This operation can be expensive on large datasets. Prefer bumping
    // feed versions (which `invalidateRelatedCaches` does) for regular
    // invalidation.
    const patterns = ['hot_posts:*'];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Cleared ${keys.length} keys matching pattern: ${pattern}`);
      }
    }

    // Also bump feed versions globally and per-category to ensure feed keys
    // are invalidated without scanning.
    await this.bumpFeedVersion(null);
  }
}
