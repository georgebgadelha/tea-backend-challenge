import * as supertest from 'supertest';
const request = supertest.default;
import mongoose from 'mongoose';
import app from '../../index';
import { Category } from '../../models/Category';
import { connectDatabase, disconnectDatabase } from '../../config/database';

describe('Categories API Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database only if not already connected
    if (!mongoose.connection.readyState) {
      await connectDatabase();
    }
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Category.deleteMany({});
    if (mongoose.connection.readyState === 1) {
      await disconnectDatabase();
    }
  });

  beforeEach(async () => {
    // Clean up before each test
    await Category.deleteMany({});
  });

  describe('POST /api/v1/categories', () => {
    it('should create a new category successfully', async () => {
      const categoryData = {
        name: 'Technology',
        description: 'Tech-related posts'
      };

      const response = await request(app)
        .post('/api/v1/categories')
        .set('X-User-Id', 'tea-backend-test')
        .send(categoryData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(categoryData.name);
      expect(response.body.data.description).toBe(categoryData.description);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/categories')
        .set('X-User-Id', 'tea-backend-test')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 409 for duplicate category name', async () => {
      // Create first category
      await Category.create({
        name: 'Technology',
        description: 'First tech category'
      });

      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/categories')
        .set('X-User-Id', 'tea-backend-test')
        .send({
          name: 'Technology',
          description: 'Second tech category'
        })
        .expect(409);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 when X-User-Id header is missing', async () => {
      const categoryData = {
        name: 'Technology',
        description: 'Tech-related posts'
      };

      const response = await request(app)
        .post('/api/v1/categories')
        .send(categoryData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });

  describe('GET /api/v1/categories', () => {
    beforeEach(async () => {
      // Create test categories
      await Category.create([
        { name: 'Technology', description: 'Tech posts' },
        { name: 'Sports', description: 'Sports posts' },
        { name: 'Travel', description: 'Travel posts' }
      ]);
    });

    it('should get all categories', async () => {
      const response = await request(app)
        .get('/api/v1/categories')
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('description');
    });

    it('should return empty array when no categories exist', async () => {
      // Clear all categories
      await Category.deleteMany({});

      const response = await request(app)
        .get('/api/v1/categories')
        .set('X-User-Id', 'tea-backend-test')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return 401 when X-User-Id header is missing', async () => {
      const response = await request(app)
        .get('/api/v1/categories')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Authentication required');
    });
  });
});