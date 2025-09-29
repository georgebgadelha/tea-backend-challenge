import { Router } from 'express';
import { createPost, bulkCreatePosts, getPostById, getPosts, likePost, unlikePost, getPostAnalytics } from '../controllers/postController';
import { authenticateUser } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Posts
 *   description: Post management endpoints
 */

/**
 * @swagger
 * /api/v1/posts:
 *   post:
 *     summary: Create a new post
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePostRequest'
 *     responses:
 *       201:
 *         description: Post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Post'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// POST /posts - Create new post
router.post('/', authenticateUser, createPost);

/**
 * @swagger
 * /api/v1/posts/bulk:
 *   post:
 *     summary: Create multiple posts in bulk
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkCreatePostsRequest'
 *     responses:
 *       201:
 *         description: Posts created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         posts:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/Post'
 *                         summary:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: number
 *                             successful:
 *                               type: number
 *                             failed:
 *                               type: number
 *                             errors:
 *                               type: array
 *                               items:
 *                                 type: string
 *       207:
 *         description: Some posts created, some failed (Multi-Status)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: Invalid input, too many posts, or all posts failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// POST /posts/bulk - Bulk create posts
router.post('/bulk', authenticateUser, bulkCreatePosts);

/**
 * @swagger
 * /api/v1/posts:
 *   get:
 *     summary: Get posts with pagination and filtering
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of posts per page
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, relevance, freshness, likeCount]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: algorithm
 *         schema:
 *           type: string
 *           enum: [base, trend]
 *           default: base
 *         description: Scoring algorithm for relevance-based sorting (A/B: base vs trend)
 *     responses:
 *       200:
 *         description: Posts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - $ref: '#/components/schemas/PaginationResponse'
 *       401:
 *         description: Unauthorized
 */
// GET /posts - Get all posts with pagination
router.get('/', authenticateUser, getPosts);

/**
 * @swagger
 * /api/v1/posts/analytics:
 *   get:
 *     summary: Get scoring analytics
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Analytics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         algorithms:
 *                           type: object
 *                           additionalProperties:
 *                             type: object
 *                             properties:
 *                               avgScore:
 *                                 type: number
 *                               maxScore:
 *                                 type: number
 *                               minScore:
 *                                 type: number
 *                               variance:
 *                                 type: number
 *                               stdDev:
 *                                 type: number
 *                               processingTimeMs:
 *                                 type: number
 *                               sampleSize:
 *                                 type: number
 *                         totalPosts:
 *                           type: number
 *                         analysisTimestamp:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// GET /posts/analytics - Get scoring analytics (must come before /:id route)
router.get('/analytics', authenticateUser, getPostAnalytics);

/**
 * @swagger
 * /api/v1/posts/{id}:
 *   get:
 *     summary: Get a single post by ID
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Post'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 */
// GET /posts/:id - Get single post
router.get('/:id', authenticateUser, getPostById);

/**
 * @swagger
 * /api/v1/posts/{id}/like:
 *   post:
 *     summary: Like a post
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post liked successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         post:
 *                           $ref: '#/components/schemas/Post'
 *                         message:
 *                           type: string
 *                           example: "Post liked successfully"
 *       400:
 *         description: Invalid post ID or post already liked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// POST /posts/:id/like - Like a post
router.post('/:id/like', authenticateUser, likePost);

/**
 * @swagger
 * /api/v1/posts/{id}/like:
 *   delete:
 *     summary: Unlike a post
 *     tags: [Posts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Post ID
 *     responses:
 *       200:
 *         description: Post unliked successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         post:
 *                           $ref: '#/components/schemas/Post'
 *                         message:
 *                           type: string
 *                           example: "Post unliked successfully"
 *       400:
 *         description: Invalid post ID or post not liked yet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Post not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// DELETE /posts/:id/like - Unlike a post
router.delete('/:id/like', authenticateUser, unlikePost);

export default router;