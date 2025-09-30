import { Request, Response, NextFunction } from 'express';
import { authenticateUser } from '../../middleware/auth';
import { createMockRequest, createMockResponse } from '../utils/testUtils';

// Mock the logger
jest.mock('../../utils/logger');

describe('Authentication Middleware Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();
    mockNext = jest.fn();

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('authenticateUser middleware', () => {
    it('should authenticate user with valid X-User-Id header', () => {
      mockRequest = createMockRequest({
        headers: { 'x-user-id': 'tea-backend-test' },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.userId).toBe('tea-backend-test');
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should trim whitespace from user ID', () => {
      mockRequest = createMockRequest({
        headers: { 'x-user-id': '  tea-backend-test  ' },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.userId).toBe('tea-backend-test');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should return 401 when X-User-Id header is missing', () => {
      mockRequest = createMockRequest({
        headers: {},
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required. Please provide X-User-Id header.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when X-User-Id is empty string', () => {
      mockRequest = createMockRequest({
        headers: { 'x-user-id': '' },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required. Please provide X-User-Id header.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when X-User-Id is only whitespace', () => {
      mockRequest = createMockRequest({
        headers: { 'x-user-id': '   ' },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid X-User-Id format. Must be a non-empty string.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when X-User-Id is too short', () => {
      mockRequest = createMockRequest({
        headers: { 'x-user-id': 'ab' },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized. Invalid X-User-Id value.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when X-User-Id is too long', () => {
      const longUserId = 'a'.repeat(101);
      mockRequest = createMockRequest({
        headers: { 'x-user-id': longUserId },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized. Invalid X-User-Id value.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when X-User-Id is not a string', () => {
      mockRequest = createMockRequest({
        headers: { 'x-user-id': 123 as any },
        method: 'POST',
        originalUrl: '/api/posts',
      });

      authenticateUser(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid X-User-Id format. Must be a non-empty string.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
