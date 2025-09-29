import * as supertest from 'supertest';
const request = supertest.default;
import app from '../../index';
import { Category } from '../../models/Category';
import { Post } from '../../models/Post';
import { Like } from '../../models/Like';

describe('Posts API Integration Tests', () => {
  let testCategory: any;

  beforeEach(async () => {
    // Create a test category
    testCategory = await Category.create({
      name: 'Technology',
      description: 'Tech-related posts'
    });
  });

  describe('POST /api/v1/posts', () => {
    it('should create a new post successfully', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content',
        categoryId: testCategory._id.toString()
      };

      const response = await request(app)
        .post('/api/v1/posts')
        .set('X-User-Id', 'tea-backend-test')
        .send(postData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe(postData.title);
      expect(response.body.data.content).toBe(postData.content);
      expect(response.body.data.categoryId._id.toString()).toBe(testCategory._id.toString());
      expect(response.body.data.likeCount).toBe(0);
      expect(response.body.data.score).toBeGreaterThan(0);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/posts')
        .set('X-User-Id', 'tea-backend-test')
        .send({
          title: 'Test Post'
          // Missing content and categoryId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should return 400 for invalid category ID', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content',
        categoryId: 'invalid-id'
      };

      const response = await request(app)
        .post('/api/v1/posts')
        .set('X-User-Id', 'tea-backend-test')
        .send(postData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for non-existent category', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content',
        categoryId: '507f1f77bcf86cd799439011' // Valid ObjectId but doesn't exist
      };

      const response = await request(app)
        .post('/api/v1/posts')
        .set('X-User-Id', 'tea-backend-test')
        .send(postData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Category does not exist');
    });

    it('should return 401 when X-User-Id header is missing', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content',
        categoryId: testCategory._id.toString()
      };

      const response = await request(app)
        .post('/api/v1/posts')
        .send(postData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });

  describe('GET /api/v1/posts', () => {
    let testPosts: any[];

    beforeEach(async () => {
      // Create test posts
      testPosts = await Post.create([
        {
          title: 'First Post',
          content: 'First post content with enough characters to meet validation',
          categoryId: testCategory._id,
          authorId: 'tea-backend-test',
          likeCount: 5
        },
        {
          title: 'Second Post',
          content: 'Second post content with enough characters to meet validation',
          categoryId: testCategory._id,
          authorId: 'tea-backend-test',
          likeCount: 10
        },
        {
          title: 'Third Post',
          content: 'Third post content with enough characters to meet validation',
          categoryId: testCategory._id,
          authorId: 'tea-backend-test',
          likeCount: 2
        }
      ]);
    });

    it('should get posts with default pagination', async () => {
      const response = await request(app)
        .get('/api/v1/posts')
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
      expect(response.body.pagination.total).toBe(3);
      expect(response.body.pagination.totalPages).toBe(1);
    });

    it('should support page-based pagination', async () => {
      const response = await request(app)
        .get('/api/v1/posts?page=1&limit=2')
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.hasNext).toBe(true);
      expect(response.body.pagination.hasPrevious).toBe(false);
    });

    it('should support offset-based pagination', async () => {
      const response = await request(app)
        .get('/api/v1/posts?offset=1&limit=2')
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.offset).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.nextOffset).toBe(null); // No more posts after offset 3
      expect(response.body.pagination.prevOffset).toBe(0);
    });

    it('should support sorting by likeCount', async () => {
      const response = await request(app)
        .get('/api/v1/posts?sortBy=likeCount&order=desc')
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data[0].likeCount).toBe(10);
      expect(response.body.data[1].likeCount).toBe(5);
      expect(response.body.data[2].likeCount).toBe(2);
    });

    it('should filter by category', async () => {
      // Create another category and post
      const anotherCategory = await Category.create({
        name: 'Sports',
        description: 'Sports-related posts'
      });

      await Post.create({
        title: 'Sports Post',
        content: 'Sports content with enough characters to meet validation requirements',
        categoryId: anotherCategory._id,
        authorId: 'tea-backend-test'
      });

      const response = await request(app)
        .get(`/api/v1/posts?category=${testCategory._id}`)
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3); // Only the original test posts
      expect(response.body.data.every((post: any) => 
        post.categoryId._id.toString() === testCategory._id.toString()
      )).toBe(true);
    });
  });

  describe('GET /api/v1/posts/:id', () => {
    let testPost: any;

    beforeEach(async () => {
      testPost = await Post.create({
        title: 'Test Post',
        content: 'Test content with enough characters to meet validation requirements',
        categoryId: testCategory._id,
        authorId: 'tea-backend-test'
      });
    });

    it('should get a post by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/posts/${testPost._id}`)
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data._id.toString()).toBe(testPost._id.toString());
      expect(response.body.data.title).toBe('Test Post');
      expect(response.body.data.categoryId.name).toBe('Technology');
    });

    it('should return 400 for invalid post ID', async () => {
      const response = await request(app)
        .get('/api/v1/posts/invalid-id')
        .set('X-User-Id', 'tea-backend-test')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .get('/api/v1/posts/507f1f77bcf86cd799439011')
        .set('X-User-Id', 'tea-backend-test')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should return 401 when X-User-Id header is missing for GET', async () => {
      const response = await request(app)
        .get('/api/v1/posts/507f1f77bcf86cd799439011')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });

  describe('Authentication Tests', () => {
    it('should return 401 for GET /api/v1/posts without auth header', async () => {
      const response = await request(app)
        .get('/api/v1/posts')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });

  describe('POST /api/v1/posts/:id/like', () => {
    let testPost: any;

    beforeEach(async () => {
      testPost = await Post.create({
        title: 'Test Post for Liking',
        content: 'Test content for liking',
        categoryId: testCategory._id,
        authorId: 'tea-backend-test',
        likeCount: 0
      });
    });

    it('should like a post successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${testPost._id}/like`)
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.post.likeCount).toBe(1);
      expect(response.body.data.message).toBe('Post liked successfully');

      // Verify like was created in database
      const like = await Like.findOne({ userId: 'tea-backend-test', postId: testPost._id });
      expect(like).toBeTruthy();
    });

    it('should return 400 if post is already liked by user', async () => {
      // Like the post first
      await Like.create({
        userId: 'tea-backend-test',
        postId: testPost._id
      });

      const response = await request(app)
        .post(`/api/v1/posts/${testPost._id}/like`)
        .set('X-User-Id', 'tea-backend-test')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already liked');
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .post('/api/v1/posts/507f1f77bcf86cd799439011/like')
        .set('X-User-Id', 'tea-backend-test')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Post not found');
    });

    it('should return 401 when X-User-Id header is missing', async () => {
      const response = await request(app)
        .post(`/api/v1/posts/${testPost._id}/like`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });

  describe('DELETE /api/v1/posts/:id/like', () => {
    let testPost: any;
    let testLike: any;

    beforeEach(async () => {
      testPost = await Post.create({
        title: 'Test Post for Unliking',
        content: 'Test content for unliking',
        categoryId: testCategory._id,
        authorId: 'tea-backend-test',
        likeCount: 1
      });

      testLike = await Like.create({
        userId: 'tea-backend-test',
        postId: testPost._id
      });
    });

    it('should unlike a post successfully', async () => {
      const response = await request(app)
        .delete(`/api/v1/posts/${testPost._id}/like`)
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.post.likeCount).toBe(0);
      expect(response.body.data.message).toBe('Post unliked successfully');

      // Verify like was removed from database
      const like = await Like.findOne({ userId: 'tea-backend-test', postId: testPost._id });
      expect(like).toBeNull();
    });

    it('should return 400 if post is not liked by user', async () => {
      // Remove the like first
      await Like.deleteOne({ userId: 'tea-backend-test', postId: testPost._id });

      const response = await request(app)
        .delete(`/api/v1/posts/${testPost._id}/like`)
        .set('X-User-Id', 'tea-backend-test')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not liked');
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app)
        .delete('/api/v1/posts/507f1f77bcf86cd799439011/like')
        .set('X-User-Id', 'tea-backend-test')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Post not found');
    });

    it('should return 401 when X-User-Id header is missing', async () => {
      const response = await request(app)
        .delete(`/api/v1/posts/${testPost._id}/like`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });
});