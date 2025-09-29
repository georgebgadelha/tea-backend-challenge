import * as express from 'express';
import { Request, Response } from 'express';
import * as cors from 'cors';
import {
  connectDatabase,
  getDatabaseHealth,
  disconnectDatabase,
} from './config/database';
import { connectRedis, getRedisHealth, disconnectRedis } from './config/redis';
import { setupSwagger } from './config/swagger';
import { logger } from './utils/logger';
import { setupRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';

const app = express.default();
const PORT = process.env.PORT || 3000;

// App setup - middlewares and routes (always happens when app is imported)
app.use(cors.default());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Swagger documentation
setupSwagger(app);

setupRoutes(app);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "OK"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   properties:
 *                     mongodb:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "connected"
 *                         responseTime:
 *                           type: number
 *                           example: 5
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                           example: "connected"
 *                         responseTime:
 *                           type: number
 *                           example: 2
 */
app.get('/health', async (req: Request, res: Response) => {
  const mongoHealth = await getDatabaseHealth();
  const redisHealth = await getRedisHealth();

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoHealth,
      redis: redisHealth,
    },
  });
});

// Global error handler
app.use(errorHandler);

async function startServer() {
  try {
    if (process.env.NODE_ENV !== 'test') {
      logger.info('Connecting to databases...');
      await connectDatabase();
      await connectRedis();
      logger.info('Database connections established');
    }

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    process.on('SIGTERM', () => {
      logger.info('Shutting server down...');
      server.close(async () => {
        try {
          await disconnectDatabase();
          await disconnectRedis();

          logger.info('All connections closed, process terminated');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start server if not in test environment and this file is run directly
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  startServer();
}

export default app;
