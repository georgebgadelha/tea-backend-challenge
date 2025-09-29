export const categoryErrorMessages = {
  CATEGORY_NOT_FOUND: 'Category not found',
  CATEGORY_NAME_REQUIRED: 'Category name is required',
  CATEGORY_NAME_INVALID: 'Category name must be a non-empty string',
  CATEGORY_ALREADY_EXISTS: 'Category already exists',
  CATEGORY_NAME_ALREADY_EXISTS: 'Category name already exists',
  CATEGORY_HAS_POSTS: 'Cannot delete category with existing posts',
  FAILED_TO_CREATE: 'Failed to create category',
  FAILED_TO_FETCH: 'Failed to fetch category',
  FAILED_TO_FETCH_CATEGORIES: 'Failed to fetch categories',
  FAILED_TO_UPDATE: 'Failed to update category',
  FAILED_TO_DELETE: 'Failed to delete category',
  INTERNAL_SERVER_ERROR: 'Internal server error',
};

export const postErrorMessages = {
  POST_NOT_FOUND: 'Post not found',
  POST_TITLE_REQUIRED: 'Title, content, and categoryId are required',
  POST_CONTENT_REQUIRED: 'Post content is required',
  POST_CATEGORY_INVALID: 'Invalid category ID',
  POST_ID_INVALID: 'Invalid post ID format',
  CATEGORY_NOT_EXISTS: 'Category does not exist',
  CATEGORY_NOT_ACTIVE: 'Cannot create post in inactive category',
  POST_ALREADY_LIKED: 'Post already liked by this user',
  POST_NOT_LIKED: 'Post not liked by this user',
  FAILED_TO_UPDATE_LIKE_COUNT: 'Failed to update post like count',
  BULK_POSTS_REQUIRED: 'Posts array is required',
  BULK_POSTS_EMPTY: 'At least one post is required',
  BULK_NO_POSTS_PROVIDED: 'No posts provided for bulk creation',
  BULK_SIZE_EXCEEDED: 'Bulk create limited to 50 posts per request',
  FAILED_TO_CREATE: 'Failed to create post',
  FAILED_TO_BULK_CREATE: 'Failed to bulk create posts',
  FAILED_TO_FETCH: 'Failed to fetch post',
  FAILED_TO_FETCH_POSTS: 'Failed to fetch posts',
  FAILED_TO_LIKE: 'Failed to like post',
  FAILED_TO_UNLIKE: 'Failed to unlike post',
  FAILED_TO_GENERATE_ANALYTICS: 'Failed to generate analytics',
  INTERNAL_SERVER_ERROR: 'Internal server error',
};

export const authErrorMessages = {
  UNAUTHORIZED: 'Unauthorized',
  INVALID_TOKEN: 'Invalid token',
  TOKEN_EXPIRED: 'Token expired',
  ACCESS_DENIED: 'Access denied'
};