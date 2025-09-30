import { Router } from 'express';
import { getCategories, createCategory, deleteCategory, updateCategoryStatus, getActiveCategories } from '../controllers/categoryController';
import { authenticateUser } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category management endpoints
 */

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     summary: List all categories
 *     tags: [Categories]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Category'
 *       401:
 *         description: Unauthorized
 */
// GET /categories - List all categories
router.get('/', authenticateUser, getCategories);

/**
 * @swagger
 * /api/v1/categories/active:
 *   get:
 *     summary: List active categories only
 *     tags: [Categories]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Active categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Category'
 *       401:
 *         description: Unauthorized
 */
// GET /categories/active - List active categories only
router.get('/active', authenticateUser, getActiveCategories);

/**
 * @swagger
 * /api/v1/categories:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryRequest'
 *           examples:
 *             sampleCreateCategory:
 *               summary: Create category example
 *               value:
 *                 name: "Green Tea"
 *                 description: "All about green tea varieties and brewing techniques"
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Category'
 *             examples:
 *               createdCategory:
 *                 summary: Created category example
 *                 value:
 *                   success: true
 *                   data:
 *                     _id: "64f5a1b2c3d4e5f6a7b8c9d2"
 *                     name: "Green Tea"
 *                     description: "All about green tea varieties and brewing techniques"
 *                     isActive: true
 *                     createdAt: "2025-09-29T12:00:00.000Z"
 *                     updatedAt: "2025-09-29T12:00:00.000Z"
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Category already exists
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// POST /categories - Create new category
router.post('/', authenticateUser, createCategory);

/**
 * @swagger
 * /api/v1/categories/{id}/status:
 *   patch:
 *     summary: Update category status (activate/deactivate)
 *     tags: [Categories]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCategoryStatusRequest'
 *           examples:
 *             sampleUpdateStatus:
 *               summary: Update category status example
 *               value:
 *                 isActive: false
 *     responses:
 *       200:
 *         description: Category status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Category'
 *             examples:
 *               updatedCategory:
 *                 summary: Updated category example
 *                 value:
 *                   success: true
 *                   data:
 *                     _id: "64f5a1b2c3d4e5f6a7b8c9d2"
 *                     name: "Green Tea"
 *                     description: "All about green tea varieties and brewing techniques"
 *                     isActive: false
 *                     updatedAt: "2025-09-29T12:30:00.000Z"
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 */
// PATCH /categories/:id/status - Update category status (activate/deactivate)
router.patch('/:id/status', authenticateUser, updateCategoryStatus);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   delete:
 *     summary: Delete a category
 *     tags: [Categories]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Category not found
 *       400:
 *         description: Cannot delete category with existing posts
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 */
// DELETE /categories/:id - Delete category
router.delete('/:id', authenticateUser, deleteCategory);

export default router;