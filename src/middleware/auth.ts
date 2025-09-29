import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// To avoid typescript error while doing "req.userId" in controllers
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const authenticateUser = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      logger.warn('Authentication failed: Missing X-User-Id header', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
      });

      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide X-User-Id header.',
      });
    }

    if (typeof userId !== 'string' || userId.trim().length === 0) {
      logger.warn('Authentication failed: Invalid X-User-Id format', {
        method: req.method,
        url: req.originalUrl,
        userId: userId,
        ip: req.ip,
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid X-User-Id format. Must be a non-empty string.',
      });
    }

    const trimmedUserId = userId.trim();
    if (trimmedUserId !== 'tea-backend-test') {
      logger.warn('Authentication failed: Invalid X-User-Id value', {
        method: req.method,
        url: req.originalUrl,
        userId: trimmedUserId,
        ip: req.ip,
      });

      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Invalid X-User-Id value.',
      });
    }

    req.userId = trimmedUserId;

    logger.debug('User authenticated successfully', {
      method: req.method,
      url: req.originalUrl,
      userId: trimmedUserId,
      ip: req.ip,
    });

    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal authentication error',
    });
  }
};
