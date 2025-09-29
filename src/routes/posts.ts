import { Router } from 'express';
import { createPost, bulkCreatePosts, getPostById, getPosts, likePost, unlikePost, getPostAnalytics } from '../controllers/postController';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// POST /posts - Create new post
router.post('/', authenticateUser, createPost);

// POST /posts/bulk - Bulk create posts
router.post('/bulk', authenticateUser, bulkCreatePosts);

// GET /posts - Get all posts with pagination
router.get('/', authenticateUser, getPosts);

// GET /posts/analytics - Get scoring analytics (must come before /:id route)
router.get('/analytics', authenticateUser, getPostAnalytics);

// GET /posts/:id - Get single post
router.get('/:id', authenticateUser, getPostById);

// POST /posts/:id/like - Like a post
router.post('/:id/like', authenticateUser, likePost);

// DELETE /posts/:id/like - Unlike a post
router.delete('/:id/like', authenticateUser, unlikePost);

export default router;