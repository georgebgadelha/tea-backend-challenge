import express, { Request, Response } from 'express';
import cors from 'cors';
import { connectDatabase, getDatabaseHealth, disconnectDatabase } from './config/database';
import { connectRedis, getRedisHealth, disconnectRedis } from './config/redis';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    logger.info('Connecting to databases...');
    await connectDatabase();
    await connectRedis();
    logger.info('Database connections established');

    // Middlewares
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

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

startServer();