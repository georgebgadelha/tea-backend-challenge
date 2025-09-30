import { Request, Response } from 'express';
import { PostService } from '../services/PostService';
import { RedisPostService } from '../services/RedisPostService';
import { postErrorMessages } from '../utils/errorMessages';
import { handlePostError, validateObjectId } from '../utils/errorHandlers';
import { ScoreCalculator } from '../utils/scoreCalculator';
import { ScoringAlgorithm, SortOption, SortOrder, ScoringConfig, DEFAULT_SCORING_CONFIG } from '../types/scoring';

let postService: PostService | RedisPostService | null = null;

// Lazy call for service instance - use plain PostService in test environment
function getPostService(): PostService | RedisPostService {
  if (!postService) {
    if (process.env.NODE_ENV === 'test') {
      postService = new PostService();
    } else {
      postService = new RedisPostService();
    }
  }
  return postService;
}

// Test helper to reset the service instance
export function resetPostService(): void {
  postService = null;
}

export const createPost = async (req: Request, res: Response) => {
  try {
    const { title, content, categoryId } = req.body;
    const userId = req.userId!; // Auth middleware guarantees this exists

    // Input validation
    if (!title || !content || !categoryId) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.POST_TITLE_REQUIRED
      });
    }

    // Validate ObjectId format for categoryId
    if (!validateObjectId(categoryId)) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.POST_CATEGORY_INVALID
      });
    }

    const post = await getPostService().createPost({
      title,
      content,
      categoryId,
      authorId: userId
    });

    res.status(201).json({
      success: true,
      data: post,
      message: 'Post created successfully'
    });
  } catch (error: any) {
    handlePostError(error, res, 'Create post');
  }
};

export const bulkCreatePosts = async (req: Request, res: Response) => {
  try {
    const { posts } = req.body;
    const userId = req.userId!; // Auth middleware guarantees this exists

    // Input validation
    if (!posts || !Array.isArray(posts)) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.BULK_POSTS_REQUIRED
      });
    }

    if (posts.length === 0) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.BULK_POSTS_EMPTY
      });
    }

    // Check bulk size limit
    if (posts.length > 50) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.BULK_SIZE_EXCEEDED
      });
    }

  const result = await getPostService().bulkCreatePosts(posts, userId);

    // Return appropriate status code based on results
    const statusCode = result.failed === 0 ? 201 : 
                      result.successful === 0 ? 400 : 207; // 207 = Multi-Status

    res.status(statusCode).json({
      success: result.failed === 0,
      data: {
        posts: result.posts,
        summary: {
          total: posts.length,
          successful: result.successful,
          failed: result.failed,
          errors: result.errors
        }
      },
      message: result.failed === 0 ? 
        'All posts created successfully' : 
        `${result.successful} posts created, ${result.failed} failed`
    });
  } catch (error: any) {
    handlePostError(error, res, 'Bulk create posts');
  }
};

export const getPostById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId format
    if (!validateObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.POST_ID_INVALID
      });
    }
    
  const post = await getPostService().getPostById(id);

    res.json({
      success: true,
      data: post
    });
  } catch (error: any) {
    handlePostError(error, res, 'Get post');
  }
};

export const getPosts = async (req: Request, res: Response) => {
  try {
    // Parse scoring configuration
    const algorithm = req.query.algorithm as ScoringAlgorithm || DEFAULT_SCORING_CONFIG.algorithm;
    const freshnessWeight = req.query.freshnessWeight ? 
      parseFloat(req.query.freshnessWeight as string) : 
      DEFAULT_SCORING_CONFIG.freshnessWeight;
    const maxAgeHours = req.query.maxAgeHours ? 
      parseInt(req.query.maxAgeHours as string) : 
      DEFAULT_SCORING_CONFIG.maxAgeHours;

    const scoringConfig: ScoringConfig = {
      algorithm,
      freshnessWeight,
      maxAgeHours
    };

    const filters = {
      categoryId: req.query.category as string,
      sortBy: req.query.sortBy as SortOption,
      order: req.query.order as SortOrder,
      scoringConfig
    };

    // Parse pagination with safe defaults to avoid NaN values leaking into service
    const parsedPage = req.query.page ? parseInt(req.query.page as string, 10) : NaN;
    const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : NaN;
    const parsedOffset = req.query.offset ? parseInt(req.query.offset as string, 10) : NaN;

  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

  // If client explicitly provided an offset, pass it through. Otherwise
  // omit offset and let the service compute skip based on its own clamped limit.
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : undefined;

  const pagination: any = { page, limit };
  if (offset !== undefined) pagination.offset = offset;

  const result = await getPostService().getPosts(filters, pagination);

    res.json({
      success: true,
      data: result.posts,
      pagination: result.pagination,
      scoring: {
        algorithm: scoringConfig.algorithm,
        freshnessWeight: scoringConfig.freshnessWeight,
        maxAgeHours: scoringConfig.maxAgeHours
      }
    });
  } catch (error: any) {
    handlePostError(error, res, 'Get posts');
  }
};

export const likePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!; // Auth middleware guarantees this exists

    // Validate ObjectId format
    if (!validateObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.POST_ID_INVALID
      });
    }

  const result = await getPostService().likePost(userId, id);

    res.json({
      success: true,
      data: {
        post: result.post,
        message: 'Post liked successfully'
      }
    });
  } catch (error: any) {
    handlePostError(error, res, 'Like post');
  }
};

export const unlikePost = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!; // Auth middleware guarantees this exists

    // Validate ObjectId format
    if (!validateObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: postErrorMessages.POST_ID_INVALID
      });
    }

  const result = await getPostService().unlikePost(userId, id);

    res.json({
      success: true,
      data: {
        post: result.post,
        message: 'Post unliked successfully'
      }
    });
  } catch (error: any) {
    handlePostError(error, res, 'Unlike post');
  }
};

export const getPostAnalytics = async (req: Request, res: Response) => {
  try {
    const filters = {
      categoryId: req.query.category as string
    };

    // Get posts for analysis (without pagination to analyze all data)
  const result = await getPostService().getPosts(filters, { limit: 1000 });
    
    if (result.posts.length === 0) {
      return res.json({
        success: true,
        message: 'No posts found for analysis',
        data: {
          algorithms: {},
          totalPosts: 0
        }
      });
    }

    // Test all algorithms
    const algorithms = Object.values(ScoringAlgorithm);
    const analytics: any = {};

    algorithms.forEach(algorithm => {
      const config: ScoringConfig = {
        algorithm,
        freshnessWeight: 1.0,
        maxAgeHours: 168
      };

      const start = Date.now();
      
      // Calculate scores for all posts
      const scores = result.posts.map(post => {
        const scoreResult = ScoreCalculator.calculateScore(
          post.likeCount, 
          post.createdAt, 
          config
        );
        return scoreResult.finalScore;
      });

      const processingTime = Date.now() - start;

      // Calculate statistics
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      analytics[algorithm] = {
        avgScore: Number(avgScore.toFixed(4)),
        maxScore: Number(maxScore.toFixed(4)),
        minScore: Number(minScore.toFixed(4)),
        variance: Number(variance.toFixed(4)),
        stdDev: Number(stdDev.toFixed(4)),
        processingTimeMs: processingTime,
        sampleSize: scores.length
      };
    });

    res.json({
      success: true,
      data: {
        algorithms: analytics,
        totalPosts: result.posts.length,
        analysisTimestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    handlePostError(error, res, 'Get post analytics');
  }
};