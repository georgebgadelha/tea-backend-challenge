import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tea Backend Challenge API',
      version: '1.0.0',
      description: 'Post feed API with relevance scoring and Redis caching',
      contact: {
        name: 'API Support',
        email: 'support@tea-backend.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-user-id',
          description: 'User ID for authentication (simplified auth for demo)',
        },
      },
      schemas: {
        Post: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Post ID',
              example: '64f5a1b2c3d4e5f6a7b8c9d0',
            },
            title: {
              type: 'string',
              description: 'Post title',
              example: 'Amazing Tea Discovery',
            },
            content: {
              type: 'string',
              description: 'Post content',
              example: 'I discovered this amazing tea blend...',
            },
            authorId: {
              type: 'string',
              description: 'Author user ID',
              example: '64f5a1b2c3d4e5f6a7b8c9d1',
            },
            categoryId: {
              $ref: '#/components/schemas/Category',
            },
            likes: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Array of user IDs who liked this post',
            },
            likesCount: {
              type: 'number',
              description: 'Number of likes',
              example: 15,
            },
            score: {
              type: 'number',
              description: 'Calculated relevance score',
              example: 8.5,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        Category: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Category ID',
              example: '64f5a1b2c3d4e5f6a7b8c9d2',
            },
            name: {
              type: 'string',
              description: 'Category name',
              example: 'Green Tea',
            },
            description: {
              type: 'string',
              description: 'Category description',
              example: 'All about green tea varieties and brewing techniques',
            },
            isActive: {
              type: 'boolean',
              description: 'Whether category is active',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp',
            },
          },
        },
        CreatePostRequest: {
          type: 'object',
          required: ['title', 'content', 'categoryId'],
          properties: {
            title: {
              type: 'string',
              description: 'Post title',
              example: 'Amazing Tea Discovery',
            },
            content: {
              type: 'string',
              description: 'Post content',
              example: 'I discovered this amazing tea blend...',
            },
            categoryId: {
              type: 'string',
              description: 'Category ID',
              example: '64f5a1b2c3d4e5f6a7b8c9d2',
            },
          },
        },
        BulkCreatePostsRequest: {
          type: 'object',
          required: ['posts'],
          properties: {
            posts: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/CreatePostRequest',
              },
              description: 'Array of posts to create (max 50)',
              maxItems: 50,
            },
          },
        },
        CreateCategoryRequest: {
          type: 'object',
          required: ['name', 'description'],
          properties: {
            name: {
              type: 'string',
              description: 'Category name',
              example: 'Green Tea',
            },
            description: {
              type: 'string',
              description: 'Category description',
              example: 'All about green tea varieties and brewing techniques',
            },
          },
        },
        UpdateCategoryStatusRequest: {
          type: 'object',
          required: ['isActive'],
          properties: {
            isActive: {
              type: 'boolean',
              description: 'Whether to activate or deactivate the category',
              example: true,
            },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Request success status',
            },
            data: {
              type: 'object',
              description: 'Response data',
            },
            message: {
              type: 'string',
              description: 'Success message',
            },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        PaginationResponse: {
          type: 'object',
          properties: {
            posts: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Post',
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: {
                  type: 'number',
                  example: 1,
                },
                limit: {
                  type: 'number',
                  example: 20,
                },
                offset: {
                  type: 'number',
                  example: 0,
                },
                total: {
                  type: 'number',
                  example: 100,
                },
                totalPages: {
                  type: 'number',
                  example: 5,
                },
                hasNext: {
                  type: 'boolean',
                  example: true,
                },
                hasPrevious: {
                  type: 'boolean',
                  example: false,
                },
                nextOffset: {
                  type: 'number',
                  nullable: true,
                  example: 20,
                },
                prevOffset: {
                  type: 'number',
                  nullable: true,
                  example: null,
                },
              },
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts', 
    './src/controllers/*.ts',
    './dist/routes/*.js', 
    './dist/controllers/*.js'
  ], // Path to the API files
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Express): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Tea Backend API Documentation',
  }));
};

export default specs;