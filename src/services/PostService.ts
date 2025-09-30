import { Post } from '../models/Post';
import { Category } from '../models/Category';
import { Like } from '../models/Like';
import { logger } from '../utils/logger';
import { ScoreCalculator } from '../utils/scoreCalculator';
import { ScoringConfig, SortOption, SortOrder, DEFAULT_SCORING_CONFIG } from '../types/scoring';
import { postErrorMessages } from '../utils/errorMessages';
import mongoose from 'mongoose';

export interface CreatePostData {
  title: string;
  content: string;
  categoryId: string;
  authorId: string;
}

export interface BulkCreatePostData {
  title: string;
  content: string;
  categoryId: string;
}

export interface BulkCreateResult {
  successful: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
  posts: any[];
}

// Constants for bulk operations
const MAX_BULK_SIZE = 50; // Reduced limit for better performance
const BATCH_SIZE = 10; // Smaller batches to avoid blocking

export interface PostFilters {
  categoryId?: string;
  sortBy?: SortOption;
  order?: SortOrder;
  scoringConfig?: ScoringConfig;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  nextOffset: number | null;
  prevOffset: number | null;
}

export interface PostsResult {
  posts: any[];
  pagination: PaginationResult;
}

export interface LikeResult {
  liked: boolean;
  likeCount: number;
  post: any;
}

export class PostService {
  async bulkCreatePosts(postsData: BulkCreatePostData[], authorId: string): Promise<BulkCreateResult> {
    // Validate input size
    if (postsData.length === 0) {
      throw new Error(postErrorMessages.BULK_NO_POSTS_PROVIDED);
    }

    const result: BulkCreateResult = {
      successful: 0,
      failed: 0,
      errors: [],
      posts: []
    };

    // Validate all categories exist first - filter valid ObjectIds
    const categoryIds = [...new Set(postsData.map(post => post.categoryId))];
    const validObjectIds = categoryIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    
    logger.debug('Bulk create validation', {
      totalPosts: postsData.length,
      uniqueCategoryIds: categoryIds.length,
      validObjectIds: validObjectIds.length,
      categoryIds: categoryIds.slice(0, 3) // Show first 3 for debugging
    });
    
    let categories = [];
    let validCategoryIds = new Set<string>();
    
    if (validObjectIds.length > 0) {
      categories = await Category.find({ 
        _id: { $in: validObjectIds },
        isActive: true 
      });
      validCategoryIds = new Set(categories.map(cat => cat._id.toString()));
      
      logger.debug('Category validation results', {
        categoriesFound: categories.length,
        validCategoryIds: Array.from(validCategoryIds).slice(0, 3)
      });
    }

    // Process in batches to avoid memory issues and not block other requests
    for (let i = 0; i < postsData.length; i += BATCH_SIZE) {
      const batch = postsData.slice(i, i + BATCH_SIZE);
      
      logger.debug('Processing batch', { 
        batchIndex: Math.floor(i / BATCH_SIZE),
        batchStartIndex: i,
        batchSize: batch.length,
        totalPosts: postsData.length 
      });
      
      // Allow other operations to run between batches
      if (i > 0) {
        await new Promise(resolve => setImmediate(resolve));
      }

      await this.processBatch(batch, authorId, validCategoryIds, result, i);
    }

    // Update category post counts in batches
    if (result.successful > 0) {
      await this.updateCategoryCountsBulk(validObjectIds, result.successful);
    }

    logger.info('Bulk post creation completed', {
      total: postsData.length,
      successful: result.successful,
      failed: result.failed,
      authorId
    });

    return result;
  }

  private async processBatch(
    batch: BulkCreatePostData[], 
    authorId: string, 
    validCategoryIds: Set<string>, 
    result: BulkCreateResult, 
    batchStartIndex: number
  ) {
    const validPosts: any[] = [];
    const categoryCountUpdates = new Map<string, number>();

    // Validate batch and prepare for insertion
    batch.forEach((postData, index) => {
      const globalIndex = batchStartIndex + index;
      
      // Validate required fields
      if (!postData.title?.trim() || !postData.content?.trim() || !postData.categoryId) {
        result.failed++;
        result.errors.push({
          index: globalIndex,
          error: postErrorMessages.POST_TITLE_REQUIRED
        });
        logger.debug('Post validation failed - missing fields', { globalIndex, postData: { title: postData.title, content: postData.content, categoryId: postData.categoryId } });
        return;
      }

      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(postData.categoryId)) {
        result.failed++;
        result.errors.push({
          index: globalIndex,
          error: postErrorMessages.POST_CATEGORY_INVALID
        });
        logger.debug('Post validation failed - invalid ObjectId', { globalIndex, categoryId: postData.categoryId });
        return;
      }

      if (!validCategoryIds.has(postData.categoryId)) {
        result.failed++;
        result.errors.push({
          index: globalIndex,
          error: postErrorMessages.CATEGORY_NOT_EXISTS
        });
        logger.debug('Post validation failed - category not found', { globalIndex, categoryId: postData.categoryId, validCategoryIds: Array.from(validCategoryIds) });
        return;
      }

      validPosts.push({
        title: postData.title.trim(),
        content: postData.content.trim(),
        categoryId: postData.categoryId,
        authorId,
        likeCount: 0,
        score: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      logger.debug('Post passed validation', { globalIndex, title: postData.title, categoryId: postData.categoryId });

      // Count posts per category for bulk update
      const count = categoryCountUpdates.get(postData.categoryId) || 0;
      categoryCountUpdates.set(postData.categoryId, count + 1);
    });

    logger.debug('Batch processing summary', { 
      batchSize: batch.length, 
      validPostsCount: validPosts.length, 
      failed: result.failed 
    });

    if (validPosts.length === 0) {
      logger.debug('No valid posts to insert, skipping batch');
      return;
    }

    try {
      logger.debug('Attempting to insert posts', { 
        validPostsCount: validPosts.length,
        samplePost: validPosts[0] ? {
          title: validPosts[0].title,
          content: validPosts[0].content?.substring(0, 50),
          categoryId: validPosts[0].categoryId,
          authorId: validPosts[0].authorId
        } : null
      });
      
      // Use insertMany with ordered: false to continue on errors
      const insertedPosts = await Post.insertMany(validPosts, { 
        ordered: false,
        rawResult: false
      });

      logger.debug('Successfully inserted posts', { insertedCount: insertedPosts.length });

      // Populate categories for response
      const populatedPosts = await Post.find({
        _id: { $in: insertedPosts.map(p => p._id) }
      }).populate('categoryId', 'name description');

      logger.debug('Populated posts', { populatedCount: populatedPosts.length });

      result.successful += insertedPosts.length;
      result.posts.push(...populatedPosts);

      logger.debug('Updated result', { successful: result.successful, totalPosts: result.posts.length });

    } catch (error: any) {
      logger.info('Insert failed with error', { 
        error: error.message, 
        errorCode: error.code, 
        writeErrors: error.writeErrors?.length || 0,
        validPostsCount: validPosts.length 
      });
      
      // Handle partial failures in insertMany
      if (error.writeErrors) {
        logger.info('Handling write errors', { writeErrorCount: error.writeErrors.length });
        error.writeErrors.forEach((writeError: any) => {
          const globalIndex = batchStartIndex + writeError.index;
          result.failed++;
          result.errors.push({
            index: globalIndex,
            error: writeError.errmsg || 'Insert failed'
          });
        });
        
        // Count successful inserts
        const successfulCount = validPosts.length - error.writeErrors.length;
        result.successful += successfulCount;
        logger.info('Partial success after write errors', { successfulCount, newTotal: result.successful });
      } else {
        // Complete batch failure
        validPosts.forEach((_, index) => {
          const globalIndex = batchStartIndex + index;
          result.failed++;
          result.errors.push({
            index: globalIndex,
            error: error.message || 'Database error'
          });
        });
        logger.info('Complete batch failure', { failedCount: validPosts.length });
      }
    }
  }

  private async updateCategoryCountsBulk(categoryIds: string[], successfulCount: number) {
    if (successfulCount === 0 || categoryIds.length === 0) return;

    // Count posts per category using valid ObjectIds only
    const validCategoryIds = categoryIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validCategoryIds.length === 0) return;

    const categoryPostCounts = await Post.aggregate([
      { $match: { categoryId: { $in: validCategoryIds.map(id => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ]);

    // Update each category with its actual post count
    const bulkOps = categoryPostCounts.map(({ _id, count }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: { postCount: count } }
      }
    }));

    if (bulkOps.length > 0) {
      await Category.bulkWrite(bulkOps);
    }
  }

  async createPost(data: CreatePostData) {
    const { title, content, categoryId, authorId } = data;

    // Validate category exists and is active
    const category = await Category.findById(categoryId);
    if (!category) {
      throw new Error(postErrorMessages.CATEGORY_NOT_EXISTS);
    }
    
    if (!category.isActive) {
      throw new Error(postErrorMessages.CATEGORY_NOT_ACTIVE);
    }
    // Transactions-only implementation. This method requires the MongoDB
    // deployment to support sessions/transactions (replica set or mongos).
    let session: mongoose.ClientSession | undefined;
    try {
      session = await mongoose.startSession();
    } catch (err: any) {
      logger.error('Failed to start MongoDB session - transactions are required', { err: err?.message || err });
      // Surface a clear error so callers know the deployment isn't configured
      // for transactions. Do not fall back to a non-transactional path.
      throw new Error('MongoDB transactions are required but not supported by the current deployment. Ensure MongoDB is running as a replica set.');
    }

    try {
      session.startTransaction();

      const post = new Post({
        title,
        content,
        categoryId,
        authorId
      });

      await post.save({ session });

      // Calculate initial score (freshness + relevance). likeCount is zero here.
      try {
        const scoreResult = ScoreCalculator.calculateScore(post.likeCount || 0, post.createdAt, DEFAULT_SCORING_CONFIG);
        post.score = scoreResult.finalScore;
        // Persist score within same transaction
        await post.save({ session });
      } catch (scoreErr) {
        logger.warn('Failed to calculate/persist post score on create', { err: (scoreErr as Error).message });
      }

      // Update category post count within the transaction
      await Category.findByIdAndUpdate(
        categoryId,
        { $inc: { postCount: 1 } },
        { session }
      );

      await session.commitTransaction();

      // Populate the category for the response
      await post.populate('categoryId', 'name description');

      logger.info('Post created successfully', {
        postId: post._id,
        authorId,
        categoryId
      });

      return post;
    } catch (error: any) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        logger.warn('Failed to abort transaction during createPost error handling', { err: (abortErr as Error).message });
      }
      throw error;
    } finally {
      try {
        session.endSession();
      } catch (endErr) {
        logger.warn('Failed to end MongoDB session', { err: (endErr as Error).message });
      }
    }
  }

  async getPostById(postId: string) {
    const post = await Post.findById(postId).populate('categoryId', 'name description');
    
    if (!post) {
      throw new Error(postErrorMessages.POST_NOT_FOUND);
    }

    return post;
  }

  async getPosts(filters: PostFilters = {}, pagination: PaginationOptions = {}): Promise<PostsResult> {
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));
    
    let skipOffset: number = Math.max(0, pagination.offset || 0);
    if (pagination.offset === undefined) {
      skipOffset = (page - 1) * limit;
    }

    // Build aggregation pipeline to filter by active categories
    const pipeline: any[] = [];

    // Add category filter first if provided
    if (filters.categoryId) {
      pipeline.push({
        $match: {
          categoryId: new mongoose.Types.ObjectId(filters.categoryId)
        }
      });
    }

    // Join with categories to filter by isActive
    pipeline.push({
      $lookup: {
        from: 'categories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'category'
      }
    });

    // Ensure category exists and is active
    pipeline.push({
      $match: {
        'category.isActive': true,
        'category': { $ne: [] }
      }
    });

    // Get scoring configuration
    const scoringConfig = filters.scoringConfig || DEFAULT_SCORING_CONFIG;


  const needsScoring = filters.sortBy === SortOption.RELEVANCE;

    let posts: any[];
    let total: number;

    if (needsScoring) {
      // For score-based sorting, use database scores
      const sortField = filters.sortBy === SortOption.RELEVANCE ? 'score' : 'score';
      const sortDirection = filters.order === SortOrder.ASC ? 1 : -1;
      const sortOptions: any = {};
      sortOptions[sortField] = sortDirection;
      sortOptions.createdAt = -1; // Secondary sort

      // Add sorting to pipeline
      pipeline.push({ $sort: sortOptions });

      // Add pagination
      pipeline.push({ $skip: skipOffset });
      pipeline.push({ $limit: limit });

      // Execute aggregation
      [posts, total] = await Promise.all([
        Post.aggregate([
          ...pipeline,
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryId',
              foreignField: '_id',
              as: 'categoryId',
              pipeline: [{ $project: { name: 1, description: 1 } }]
            }
          },
          {
            $unwind: '$categoryId'
          }
        ]),
        Post.aggregate([
          ...pipeline.slice(0, -2), // Remove skip and limit for count
          { $count: 'total' }
        ]).then(result => result[0]?.total || 0)
      ]);

    } else {
      // Traditional database sorting for non-score fields
      const sortOptions = this.buildSortOptions(filters.sortBy, filters.order);

      // Add sorting to pipeline
      pipeline.push({ $sort: sortOptions });

      // Add pagination
      pipeline.push({ $skip: skipOffset });
      pipeline.push({ $limit: limit });

      [posts, total] = await Promise.all([
        Post.aggregate([
          ...pipeline,
          {
            $lookup: {
              from: 'categories',
              localField: 'categoryId',
              foreignField: '_id',
              as: 'categoryId',
              pipeline: [{ $project: { name: 1, description: 1 } }]
            }
          },
          {
            $unwind: '$categoryId'
          }
        ]),
        Post.aggregate([
          ...pipeline.slice(0, -2), // Remove skip and limit for count
          { $count: 'total' }
        ]).then(result => result[0]?.total || 0)
      ]);
    }

    // Calculate pagination metadata
    const currentPage = pagination.offset !== undefined 
      ? Math.floor(skipOffset / limit) + 1 
      : page;
    const totalPages = Math.ceil(total / limit);

    const paginationResult: PaginationResult = {
      page: currentPage,
      limit,
      offset: skipOffset,
      total,
      totalPages,
      hasNext: skipOffset + limit < total,
      hasPrevious: skipOffset > 0,
      nextOffset: skipOffset + limit < total ? skipOffset + limit : null,
      prevOffset: skipOffset > 0 ? Math.max(0, skipOffset - limit) : null
    };

    logger.info('Posts retrieved with scoring', {
      total,
      page: currentPage,
      algorithm: scoringConfig.algorithm,
      sortBy: filters.sortBy
    });

    return {
      posts,
      pagination: paginationResult
    };
  }

  async likePost(userId: string, postId: string): Promise<LikeResult> {
    // Transactions-only path: requires sessions/transactions support in MongoDB
    let session: mongoose.ClientSession | undefined;
    try {
      session = await mongoose.startSession();
    } catch (err: any) {
      logger.error('Failed to start MongoDB session - transactions are required for likePost', { err: err?.message || err });
      throw new Error('MongoDB transactions are required but not supported by the current deployment. Ensure MongoDB is running as a replica set.');
    }

    try {
      session.startTransaction();

      // Check if post exists
      const post = await Post.findById(postId).session(session);
      if (!post) {
        throw new Error(postErrorMessages.POST_NOT_FOUND);
      }

      // Check if user already liked this post
      const existingLike = await Like.findOne({ userId, postId }).session(session);
      if (existingLike) {
        throw new Error(postErrorMessages.POST_ALREADY_LIKED);
      }

      // Create new like
      const like = new Like({ userId, postId });
      await like.save({ session });

      // Update the post like count within the transaction
      const postToLike = await Post.findById(postId).session(session);
      if (!postToLike) {
        throw new Error(postErrorMessages.POST_NOT_FOUND);
      }

      postToLike.likeCount += 1;
      await postToLike.save({ session });

      // Recalculate score after like and persist
      try {
        const scoreResult = ScoreCalculator.calculateScore(postToLike.likeCount, postToLike.createdAt, DEFAULT_SCORING_CONFIG);
        postToLike.score = scoreResult.finalScore;
        await postToLike.save({ session });
      } catch (scoreErr) {
        logger.warn('Failed to recalculate/persist post score after like', { err: (scoreErr as Error).message });
      }

      // Populate the category for response
      const updatedPost = await Post.findById(postId)
        .populate('categoryId', 'name')
        .session(session);

      await session.commitTransaction();

      logger.info('Post liked successfully', {
        postId,
        userId,
        newLikeCount: updatedPost?.likeCount
      });

      return {
        liked: true,
        likeCount: updatedPost?.likeCount || 0,
        post: updatedPost
      };
    } catch (error: any) {
      try { await session.abortTransaction(); } catch (abortErr) {
        logger.warn('Failed to abort transaction during likePost error handling', { err: (abortErr as Error).message });
      }
      // Bubble up errors (including duplicate key) to the caller
      if (error.code === 11000) {
        throw new Error(postErrorMessages.POST_ALREADY_LIKED);
      }
      throw error;
    } finally {
      try { session.endSession(); } catch (endErr) {
        logger.warn('Failed to end MongoDB session after likePost', { err: (endErr as Error).message });
      }
    }
    
  }

  async unlikePost(userId: string, postId: string): Promise<LikeResult> {
    // Transactions-only path: requires sessions/transactions support in MongoDB
    let session: mongoose.ClientSession | undefined;
    try {
      session = await mongoose.startSession();
    } catch (err: any) {
      logger.error('Failed to start MongoDB session - transactions are required for unlikePost', { err: err?.message || err });
      throw new Error('MongoDB transactions are required but not supported by the current deployment. Ensure MongoDB is running as a replica set.');
    }

    try {
      session.startTransaction();

      // Check if post exists
      const post = await Post.findById(postId).session(session);
      if (!post) {
        throw new Error(postErrorMessages.POST_NOT_FOUND);
      }

      // Check if user has liked this post
      const existingLike = await Like.findOne({ userId, postId }).session(session);
      if (!existingLike) {
        throw new Error(postErrorMessages.POST_NOT_LIKED);
      }

      // Remove the like
      await Like.deleteOne({ userId, postId }).session(session);

      // Update the post like count within the transaction
      const postToUnlike = await Post.findById(postId).session(session);
      if (!postToUnlike) {
        throw new Error(postErrorMessages.POST_NOT_FOUND);
      }

      postToUnlike.likeCount = Math.max(0, postToUnlike.likeCount - 1);
        await postToUnlike.save({ session });

        // Recalculate score after unlike and persist
        try {
          const scoreResult = ScoreCalculator.calculateScore(postToUnlike.likeCount, postToUnlike.createdAt, DEFAULT_SCORING_CONFIG);
          postToUnlike.score = scoreResult.finalScore;
          await postToUnlike.save({ session });
        } catch (scoreErr) {
          logger.warn('Failed to recalculate/persist post score after unlike', { err: (scoreErr as Error).message });
        }

      // Populate the category for response
      const updatedPost = await Post.findById(postId)
        .populate('categoryId', 'name')
        .session(session);

      await session.commitTransaction();

      logger.info('Post unliked successfully', {
        postId,
        userId,
        newLikeCount: updatedPost?.likeCount
      });

      return {
        liked: false,
        likeCount: updatedPost?.likeCount || 0,
        post: updatedPost
      };
    } catch (error: any) {
      try { await session.abortTransaction(); } catch (abortErr) {
        logger.warn('Failed to abort transaction during unlikePost error handling', { err: (abortErr as Error).message });
      }
      throw error;
    } finally {
      try { session.endSession(); } catch (endErr) {
        logger.warn('Failed to end MongoDB session after unlikePost', { err: (endErr as Error).message });
      }
    }
  }

  private buildSortOptions(sortBy?: SortOption, order?: SortOrder) {
    const sortOptions: any = {};
    const sortDirection = order === SortOrder.ASC ? 1 : -1;
    
    // Handle sort field mapping
    let field: string;
    switch (sortBy) {
      case SortOption.LIKE_COUNT:
        field = 'likeCount';
        break;
      case SortOption.RELEVANCE:
      case SortOption.FRESHNESS:
        field = 'createdAt';
        break;
      default:
        field = 'createdAt';
        break;
    }
    
    sortOptions[field] = sortDirection;
    
    if (field !== 'createdAt') {
      sortOptions.createdAt = -1;
    }

    return sortOptions;
  }
}