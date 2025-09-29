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
    FEED_CACHE: (
      categoryId: string | null,
      page: number,
      sortBy: string,
      order: string
    ) => `feed:${categoryId || 'all'}:p${page}:${sortBy}:${order}`,
  };

  private readonly CONFIG = {
    MAX_HOT_POSTS_GLOBAL: 100,
    MAX_HOT_POSTS_PER_CATEGORY: 50,

    // Cache TTLs
    FEED_CACHE_TTL: 300, // 5 minutes
    HOT_POSTS_TTL: 3600, // 1 hour (for cleanup)

    // Score thresholds
    MIN_HOT_POST_SCORE: 5, // Minimum score to be considered "hot"
  };

  async getPosts(
    filters: PostFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PostsResult> {
    const page = pagination.page || 1;
    const sortBy = filters.sortBy || SortOption.CREATED_AT;
    const order = filters.order || 'desc';

    // For first page with score-based sorting, use hybrid approach
    if (page === 1 && this.isScoreBasedSort(sortBy)) {
      return this.getHybridFirstPage(filters, pagination);
    }

    // For other pages or non-score sorts, use cached approach
    return this.getCachedPosts(filters, pagination);
  }

  private async getHybridFirstPage(
    filters: PostFilters,
    pagination: PaginationOptions
  ): Promise<PostsResult> {
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));

    try {
      // Get hot posts from Redis
      const hotPostIds = await this.getHotPosts(filters.categoryId, limit);

      if (hotPostIds.length >= limit) {
        // We have enough hot posts, use them
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
    const cacheKey = this.buildCacheKey(filters, pagination);

    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.info('Feed cache hit', { cacheKey });
        return JSON.parse(cached);
      }

      // Cache miss - fetch from database
      logger.info('Feed cache miss', { cacheKey });
      const result = await super.getPosts(filters, pagination);

      // Cache the result
      await this.cacheFeedResult(cacheKey, result);

      return result;
    } catch (error) {
      logger.error('Cache operation failed, fallback to database', { error });
      return super.getPosts(filters, pagination);
    }
  }

  async likePost(userId: string, postId: string): Promise<LikeResult> {
    // Execute the like operation
    const result = await super.likePost(userId, postId);

    try {
      // Update hot posts rankings
      await this.updateHotPostRankings(result.post);

      // Invalidate relevant caches
      await this.invalidateRelatedCaches(result.post.categoryId._id);

      logger.info('Redis operations completed for like', {
        postId,
        newScore: result.post.score,
      });
    } catch (error) {
      logger.error('Redis operations failed for like', { postId, error });
      // Don't fail the like operation if Redis fails
    }

    return result;
  }

  async unlikePost(userId: string, postId: string): Promise<LikeResult> {
    // Execute the unlike operation
    const result = await super.unlikePost(userId, postId);

    try {
      // Update hot posts rankings
      await this.updateHotPostRankings(result.post);

      // Invalidate relevant caches
      await this.invalidateRelatedCaches(result.post.categoryId._id);

      logger.info('Redis operations completed for unlike', {
        postId,
        newScore: result.post.score,
      });
    } catch (error) {
      logger.error('Redis operations failed for unlike', { postId, error });
      // Don't fail the unlike operation if Redis fails
    }

    return result;
  }

  async createPost(data: any) {
    // Execute the create operation
    const post = await super.createPost(data);

    try {
      // Add to hot posts if score is high enough
      if (post.score >= this.CONFIG.MIN_HOT_POST_SCORE) {
        await this.updateHotPostRankings(post);
      }

      // Invalidate relevant caches
      await this.invalidateRelatedCaches(post.categoryId.toString());

      logger.info('Redis operations completed for create post', {
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

    // Maintain Redis order
    const postMap = new Map(posts.map((post) => [post._id.toString(), post]));
    return postIds.map((id) => postMap.get(id)).filter(Boolean);
  }

  private async getRegularPosts(
    filters: PostFilters,
    limit: number,
    excludeIds: string[]
  ): Promise<PostsResult> {
    const modifiedFilters = { ...filters };

    // Build exclusion filter
    const excludeObjectIds = excludeIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    // This would require modifying the base PostService to support exclusion
    // For now, we'll fetch more and filter client-side (not ideal for production)
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

    // Update global hot posts
    if (score >= this.CONFIG.MIN_HOT_POST_SCORE) {
      pipeline.zadd(this.REDIS_KEYS.HOT_POSTS_GLOBAL, score, postId);
      // Keep only top N posts
      pipeline.zremrangebyrank(
        this.REDIS_KEYS.HOT_POSTS_GLOBAL,
        0,
        -(this.CONFIG.MAX_HOT_POSTS_GLOBAL + 1)
      );
    } else {
      // Remove from hot posts if score is too low
      pipeline.zrem(this.REDIS_KEYS.HOT_POSTS_GLOBAL, postId);
    }

    // Update category hot posts
    const categoryKey = this.REDIS_KEYS.HOT_POSTS_CATEGORY(categoryId);
    if (score >= this.CONFIG.MIN_HOT_POST_SCORE) {
      pipeline.zadd(categoryKey, score, postId);
      // Keep only top N posts per category
      pipeline.zremrangebyrank(
        categoryKey,
        0,
        -(this.CONFIG.MAX_HOT_POSTS_PER_CATEGORY + 1)
      );
    } else {
      // Remove from hot posts if score is too low
      pipeline.zrem(categoryKey, postId);
    }

    // Set TTL for cleanup
    pipeline.expire(
      this.REDIS_KEYS.HOT_POSTS_GLOBAL,
      this.CONFIG.HOT_POSTS_TTL
    );
    pipeline.expire(categoryKey, this.CONFIG.HOT_POSTS_TTL);

    await pipeline.exec();

    logger.debug('Hot post rankings updated', { postId, score, categoryId });
  }

  private async invalidateRelatedCaches(categoryId: string): Promise<void> {
    // Invalidate score-based feed caches that would be affected
    const patterns = [
      `feed:all:*:score:*`,
      `feed:all:*:relevance:*`,
      `feed:all:*:freshness:*`,
      `feed:${categoryId}:*:score:*`,
      `feed:${categoryId}:*:relevance:*`,
      `feed:${categoryId}:*:freshness:*`,
    ];

    let totalInvalidated = 0;
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        totalInvalidated += keys.length;
      }
    }

    logger.info('Cache invalidation completed', {
      categoryId,
      keysInvalidated: totalInvalidated,
    });
  }

  private async cacheFeedResult(
    cacheKey: string,
    result: PostsResult
  ): Promise<void> {
    await this.redis.setex(
      cacheKey,
      this.CONFIG.FEED_CACHE_TTL,
      JSON.stringify(result)
    );
    logger.debug('Feed result cached', { cacheKey });
  }

  private buildCacheKey(
    filters: PostFilters,
    pagination: PaginationOptions
  ): string {
    const page = pagination.page || 1;
    const sortBy = filters.sortBy || SortOption.CREATED_AT;
    const order = filters.order || 'desc';

    return this.REDIS_KEYS.FEED_CACHE(
      filters.categoryId || null,
      page,
      sortBy,
      order
    );
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
    const patterns = ['feed:*', 'hot_posts:*'];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Cleared ${keys.length} keys matching pattern: ${pattern}`);
      }
    }
  }
}
