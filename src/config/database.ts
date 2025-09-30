import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/tea-backend-db';
    
    await mongoose.connect(mongoUri);
    
    logger.info(`Connected to MongoDB: ${mongoose.connection.db.databaseName}`);
    
    mongoose.connection.on('error', (error: Error) => {
      logger.error('MongoDB connection error:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
    
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    throw error;
  }
};

export const getDatabaseHealth = async (): Promise<{ status: string; database?: string; error?: string }> => {
  try {
    if (mongoose.connection.readyState === 1) {
      return {
        status: 'connected',
        database: mongoose.connection.db.databaseName,
      };
    } else {
      return {
        status: 'disconnected',
      };
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Something went wrong on mongoose health check',
    };
  }
};