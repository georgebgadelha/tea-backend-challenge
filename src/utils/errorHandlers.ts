import { Response } from 'express';
import { categoryErrorMessages, postErrorMessages } from './errorMessages';
import { logger } from './logger';

export interface ErrorResponse {
  success: false;
  error: string;
}

export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export type ApiResponse<T = any> = ErrorResponse | SuccessResponse<T>;

export const handleCategoryError = (error: any, res: Response, context: string): void => {
  logger.error(`${context} error:`, error);

  switch (error.message) {
    case categoryErrorMessages.CATEGORY_NOT_FOUND:
      res.status(404).json({
        success: false,
        error: categoryErrorMessages.CATEGORY_NOT_FOUND
      });
      break;

    case categoryErrorMessages.CATEGORY_ALREADY_EXISTS:
      res.status(409).json({
        success: false,
        error: categoryErrorMessages.CATEGORY_ALREADY_EXISTS
      });
      break;

    case categoryErrorMessages.CATEGORY_NAME_ALREADY_EXISTS:
      res.status(409).json({
        success: false,
        error: categoryErrorMessages.CATEGORY_NAME_ALREADY_EXISTS
      });
      break;

    case categoryErrorMessages.CATEGORY_HAS_POSTS:
      res.status(400).json({
        success: false,
        error: categoryErrorMessages.CATEGORY_HAS_POSTS
      });
      break;

    default:
      // Generic error based on context
      let genericMessage: string;
      switch (context) {
        case 'Create category':
          genericMessage = categoryErrorMessages.FAILED_TO_CREATE;
          break;
        case 'Get category':
          genericMessage = categoryErrorMessages.FAILED_TO_FETCH;
          break;
        case 'Get categories':
          genericMessage = categoryErrorMessages.FAILED_TO_FETCH_CATEGORIES;
          break;
        case 'Update category':
          genericMessage = categoryErrorMessages.FAILED_TO_UPDATE;
          break;
        case 'Delete category':
          genericMessage = categoryErrorMessages.FAILED_TO_DELETE;
          break;
        default:
          genericMessage = categoryErrorMessages.INTERNAL_SERVER_ERROR;
      }

      res.status(500).json({
        success: false,
        error: genericMessage
      });
  }
};

export const handlePostError = (error: any, res: Response, context: string): void => {
  logger.error(`${context} error:`, error);

  switch (error.message) {
    case postErrorMessages.POST_NOT_FOUND:
      res.status(404).json({
        success: false,
        error: postErrorMessages.POST_NOT_FOUND
      });
      break;

    case postErrorMessages.CATEGORY_NOT_EXISTS:
      res.status(400).json({
        success: false,
        error: postErrorMessages.CATEGORY_NOT_EXISTS
      });
      break;

    case postErrorMessages.POST_ALREADY_LIKED:
      res.status(400).json({
        success: false,
        error: postErrorMessages.POST_ALREADY_LIKED
      });
      break;

    case postErrorMessages.POST_NOT_LIKED:
      res.status(400).json({
        success: false,
        error: postErrorMessages.POST_NOT_LIKED
      });
      break;

    default:
      // Generic error based on context
      let genericMessage: string;
      switch (context) {
        case 'Create post':
          genericMessage = postErrorMessages.FAILED_TO_CREATE;
          break;
        case 'Get post':
          genericMessage = postErrorMessages.FAILED_TO_FETCH;
          break;
        case 'Get posts':
          genericMessage = postErrorMessages.FAILED_TO_FETCH_POSTS;
          break;
        case 'Like post':
          genericMessage = postErrorMessages.FAILED_TO_LIKE;
          break;
        case 'Unlike post':
          genericMessage = postErrorMessages.FAILED_TO_UNLIKE;
          break;
        case 'Get post analytics':
          genericMessage = postErrorMessages.FAILED_TO_GENERATE_ANALYTICS;
          break;
        default:
          genericMessage = postErrorMessages.INTERNAL_SERVER_ERROR;
      }

      res.status(500).json({
        success: false,
        error: genericMessage
      });
  }
};

export const validateCategoryName = (name: any): boolean => {
  return name && typeof name === 'string' && name.trim().length > 0;
};

export const validateObjectId = (id: string): boolean => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};