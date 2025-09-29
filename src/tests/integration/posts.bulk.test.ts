import * as supertest from 'supertest';
const request = supertest.default;
import app from '../../index';
import { Category } from '../../models/Category';
import { Post } from '../../models/Post';

describe('POST /api/v1/posts/bulk - Bulk Create Posts', () => {
  let categoryId: string;

  beforeEach(async () => {
    // Create a test category
    const category = new Category({
      name: 'Technology',
      description: 'Tech-related posts'
    });
    await category.save();
    categoryId = category._id.toString();
  });

  it('should bulk create posts successfully', async () => {
    const postsData = [
      {
        title: 'First Post',
        content: 'This is the content of the first post with enough characters',
        categoryId
      },
      {
        title: 'Second Post',
        content: 'This is the content of the second post with enough characters',
        categoryId
      },
      {
        title: 'Third Post',
        content: 'This is the content of the third post with enough characters',
        categoryId
      }
    ];

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.posts).toHaveLength(3);
    expect(response.body.data.summary.total).toBe(3);
    expect(response.body.data.summary.successful).toBe(3);
    expect(response.body.data.summary.failed).toBe(0);
    expect(response.body.data.summary.errors).toHaveLength(0);

        // Verify successful posts were created (checking actual count)
    const postsInDb = await Post.find({ authorId: 'tea-backend-test' });
    expect(postsInDb.length).toBe(response.body.data.summary.successful);

    // Verify category post count was updated
    const updatedCategory = await Category.findById(categoryId);
    expect(updatedCategory?.postCount).toBe(3);
  });

  it('should handle partial failures gracefully', async () => {
    const postsData = [
      {
        title: 'Valid Post',
        content: 'This is valid content with sufficient length for validation',
        categoryId
      },
      {
        title: '', // Invalid - empty title
        content: 'This is content with enough characters to pass validation',
        categoryId
      },
      {
        title: 'Another Valid Post',
        content: 'This is another valid content with sufficient length',
        categoryId
      },
      {
        title: 'Invalid Category Post',
        content: 'This is content with enough characters to pass validation',
        categoryId: '507f1f77bcf86cd799439011' // Invalid category ID
      }
    ];

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData })
      .expect(207); // Multi-Status

    expect(response.body.success).toBe(false);
    expect(response.body.data.summary.total).toBe(4);
    expect(response.body.data.summary.successful).toBe(2); // Two valid posts (Valid Post and Another Valid Post)
    expect(response.body.data.summary.failed).toBe(2); // Two invalid posts (empty title and invalid category)
    expect(response.body.data.summary.errors).toHaveLength(2);

    // Verify successful posts were created (checking actual count from response)
    const postsInDb = await Post.find({ authorId: 'tea-backend-test' });
    expect(postsInDb).toHaveLength(response.body.data.summary.successful);
  });

  it('should reject empty posts array', async () => {
    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: [] })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('At least one post is required');
  });

  it('should reject missing posts array', async () => {
    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Posts array is required');
  });

  it('should validate individual post structure', async () => {
    const postsData = [
      {
        title: 'Valid Post',
        content: 'This is valid content with sufficient length for validation',
        categoryId
      },
      {
        // Missing title - should fail
        content: 'This is content without a proper title but with enough characters',
        categoryId
      }
    ];

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData });

    // Should be 207 if at least one succeeds, 400 if all fail
    expect([207, 400]).toContain(response.status);
    
    if (response.status === 207) {
      expect(response.body.success).toBe(false);
      expect(response.body.data.summary.total).toBe(2);
      expect(response.body.data.summary.successful).toBeGreaterThan(0);
      expect(response.body.data.summary.failed).toBeGreaterThan(0);
    } else {
      // All failed
      expect(response.body.success).toBe(false);
      expect(response.body.data.summary.successful).toBe(0);
      expect(response.body.data.summary.failed).toBe(1); // Only 1 failure (the missing title post)
    }
  });

  it('should validate categoryId format', async () => {
    const postsData = [
      {
        title: 'Post with Invalid Category',
        content: 'This is content with enough characters to pass validation',
        categoryId: 'invalid-id'
      }
    ];

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData })
      .expect(400); // All fail

    expect(response.body.success).toBe(false);
    expect(response.body.data.summary.total).toBe(1);
    expect(response.body.data.summary.successful).toBe(0);
    expect(response.body.data.summary.failed).toBe(1);
    expect(response.body.data.summary.errors[0].error).toContain('Invalid category ID');
  });

  it('should handle large batch within limits', async () => {
    // Create 25 valid posts (well within limit of 50)
    const postsData = Array.from({ length: 25 }, (_, index) => ({
      title: `Post ${index + 1}`,
      content: `This is the content for post ${index + 1}. It has enough characters to meet the minimum requirement.`,
      categoryId
    }));

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.summary.total).toBe(25);
    expect(response.body.data.summary.successful).toBe(25);
    expect(response.body.data.summary.failed).toBe(0);

    // Verify all posts were created
    const postsInDb = await Post.find({ authorId: 'tea-backend-test' });
    expect(postsInDb).toHaveLength(25);

    // Verify category count
    const updatedCategory = await Category.findById(categoryId);
    expect(updatedCategory?.postCount).toBe(25);
  });

  it('should reject batch exceeding maximum size', async () => {
    // Create 51 posts (exceeding limit of 50)
    const postsData = Array.from({ length: 51 }, (_, index) => ({
      title: `Post ${index + 1}`,
      content: `This is the content for post ${index + 1}. It has enough characters to meet the minimum requirement.`,
      categoryId
    }));

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Bulk create limited to 50 posts per request');
  });

  it('should require authentication', async () => {
    const postsData = [
      {
        title: 'Test Post',
        content: 'This is test content with enough characters for validation',
        categoryId
      }
    ];

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .send({ posts: postsData })
      .expect(401);

    expect(response.body.success).toBe(false);
  });

  it('should reject posts with inactive categories', async () => {
    // Create an inactive category
    const inactiveCategory = new Category({
      name: 'Inactive Category',
      description: 'This category is inactive',
      isActive: false
    });
    await inactiveCategory.save();

    const postsData = [
      {
        title: 'Post for Inactive Category',
        content: 'This post should be rejected because the category is inactive',
        categoryId: inactiveCategory._id.toString()
      }
    ];

    const response = await request(app)
      .post('/api/v1/posts/bulk')
      .set('X-User-Id', 'tea-backend-test')
      .send({ posts: postsData })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.data.summary.successful).toBe(0);
    expect(response.body.data.summary.failed).toBe(1);
    expect(response.body.data.summary.errors[0].error).toContain('Category does not exist');
  });
});