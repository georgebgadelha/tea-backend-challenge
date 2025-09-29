import { Post } from '../models/Post';
import { Category } from '../models/Category';
import { Like } from '../models/Like';
import { logger } from '../utils/logger';
import { ScoreCalculator } from '../utils/scoreCalculator';
import { ScoringAlgorithm, ScoringConfig, SortOption, SortOrder, DEFAULT_SCORING_CONFIG } from '../types/scoring';
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

    // Use transactions only if supported (not in test env or standalone MongoDB)
    const useTransactions = process.env.NODE_ENV !== 'test';
    
    if (useTransactions) {
      const session = await mongoose.startSession();
      
      try {
        session.startTransaction();

        const post = new Post({
          title,
          content,
          categoryId,
          authorId
        });

        await post.save({ session });

        // Update category post count
        await Category.findByIdAndUpdate(
          categoryId,
          { $inc: { postCount: 1 } },
          { session }
        );

        await session.commitTransaction();

        // Populate the category for the response (after transaction)
        await post.populate('categoryId', 'name description');

        logger.info('Post created successfully', {
          postId: post._id,
          authorId,
          categoryId
        });

        return post;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      // No transactions for test environment
      const post = new Post({
        title,
        content,
        categoryId,
        authorId
      });

      await post.save();

      // Update category post count
      await Category.findByIdAndUpdate(
        categoryId,
        { $inc: { postCount: 1 } }
      );

      // Populate the category for the response
      await post.populate('categoryId', 'name description');

      logger.info('Post created successfully', {
        postId: post._id,
        authorId,
        categoryId
      });

      return post;
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

    // Determine if we need to sort by score-based fields
    const needsScoring = filters.sortBy === SortOption.RELEVANCE || 
                        filters.sortBy === SortOption.FRESHNESS;

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
    // Use transactions only if supported (not in test env or standalone MongoDB)
    const useTransactions = process.env.NODE_ENV !== 'test';
    
    if (useTransactions) {
      const session = await mongoose.startSession();
      
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

        // Update post like count atomically
        const updatedPost = await Post.findByIdAndUpdate(
          postId,
          { $inc: { likeCount: 1 } },
          { new: true, session }
        ).populate('categoryId', 'name');

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
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      // No transactions for test environment - but use atomic operations
      // Check if post exists
      const post = await Post.findById(postId);
      if (!post) {
        throw new Error(postErrorMessages.POST_NOT_FOUND);
      }

      try {
        // Create new like - unique index will prevent duplicates
        const like = new Like({ userId, postId });
        await like.save();

        // Use atomic increment to handle concurrency - this is safe even without transactions
        const updatedPost = await Post.findByIdAndUpdate(
          postId,
          { $inc: { likeCount: 1 } },
          { new: true }
        ).populate('categoryId', 'name');

        if (!updatedPost) {
          // Rollback the like if post update failed
          await Like.deleteOne({ userId, postId });
          throw new Error(postErrorMessages.FAILED_TO_UPDATE_LIKE_COUNT);
        }

        logger.info('Post liked successfully', {
          postId,
          userId,
          newLikeCount: updatedPost.likeCount
        });

        return {
          liked: true,
          likeCount: updatedPost.likeCount,
          post: updatedPost
        };
      } catch (error: any) {
        // Handle duplicate key error (user already liked this post)
        if (error.code === 11000) {
          throw new Error(postErrorMessages.POST_ALREADY_LIKED);
        }
        throw error;
      }
    }
  }

  async unlikePost(userId: string, postId: string): Promise<LikeResult> {
    // Use transactions only if supported (not in test env or standalone MongoDB)
    const useTransactions = process.env.NODE_ENV !== 'test';
    
    if (useTransactions) {
      const session = await mongoose.startSession();
      
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

        // Update post like count atomically
        const updatedPost = await Post.findByIdAndUpdate(
          postId,
          { $inc: { likeCount: -1 } },
          { new: true, session }
        ).populate('categoryId', 'name');

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
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      // No transactions for test environment - but use atomic operations
      // Check if post exists
      const post = await Post.findById(postId);
      if (!post) {
        throw new Error(postErrorMessages.POST_NOT_FOUND);
      }

      // Check if user has liked this post
      const existingLike = await Like.findOne({ userId, postId });
      if (!existingLike) {
        throw new Error(postErrorMessages.POST_NOT_LIKED);
      }

      // Remove the like first
      await Like.deleteOne({ userId, postId });

      // Use atomic decrement to handle concurrency
      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $inc: { likeCount: -1 } },
        { new: true }
      ).populate('categoryId', 'name');

      if (!updatedPost) {
        // Rollback the like deletion if post update failed
        await Like.create({ userId, postId });
        throw new Error(postErrorMessages.FAILED_TO_UPDATE_LIKE_COUNT);
      }

      // Ensure likeCount doesn't go below 0
      if (updatedPost.likeCount < 0) {
        await Post.findByIdAndUpdate(postId, { likeCount: 0 });
        updatedPost.likeCount = 0;
      }

      logger.info('Post unliked successfully', {
        postId,
        userId,
        newLikeCount: updatedPost.likeCount
      });

      return {
        liked: false,
        likeCount: updatedPost.likeCount,
        post: updatedPost
      };
    }
  }

  private buildSortOptions(sortBy?: SortOption, order?: SortOrder) {
    const sortOptions: any = {};
    const sortDirection = order === SortOrder.ASC ? 1 : -1;
    
    // Handle sort field mapping
    let field: string;
    switch (sortBy) {
      case SortOption.CREATED_AT:
        field = 'createdAt';
        break;
      case SortOption.LIKE_COUNT:
        field = 'likeCount';
        break;
      case SortOption.RELEVANCE:
      case SortOption.FRESHNESS:
        // These are handled in getPosts method with in-memory sorting
        // Fall back to createdAt for database sorting
        field = 'createdAt';
        break;
      default:
        field = 'createdAt';
        break;
    }
    
    sortOptions[field] = sortDirection;
    
    // Add secondary sort by createdAt for consistency (except when already sorting by createdAt)
    if (field !== 'createdAt') {
      sortOptions.createdAt = -1;
    }

    return sortOptions;
  }
}