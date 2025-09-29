import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Global error handler
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Unhandled error:', error);

  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

// 404 handler middleware
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
};
