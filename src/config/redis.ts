import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis;

export const connectRedis = async (): Promise<void> => {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });

    redisClient.on('connect', () => {
      logger.info('Connecting to Redis...');
    });

    redisClient.on('ready', () => {
      logger.info('Connected to Redis');
    });

    redisClient.on('error', (error: Error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    // Test connection
    await redisClient.connect();
  const pong = await redisClient.ping();
  logger.info('Redis ping response', { pong });
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Singleton pattern to ensure single Redis client instance
export const getRedisClient = (): Redis => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisClient) {
      await redisClient.quit();
      logger.info('Redis connection closed');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
    throw error;
  }
};

export const getRedisHealth = async (): Promise<{ status: string; version?: string; error?: string }> => {
  try {
    if (redisClient && redisClient.status === 'ready') {
      const info = await redisClient.info('server');
      const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
      return {
        status: 'connected',
        version,
      };
    } else {
      return {
        status: 'disconnected',
      };
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};