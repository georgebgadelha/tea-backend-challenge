import { Router } from 'express';
import { getCategories, createCategory, deleteCategory, updateCategoryStatus, getActiveCategories } from '../controllers/categoryController';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// GET /categories - List all categories
router.get('/', authenticateUser, getCategories);

// GET /categories/active - List active categories only
router.get('/active', authenticateUser, getActiveCategories);

// POST /categories - Create new category
router.post('/', authenticateUser, createCategory);

// PATCH /categories/:id/status - Update category status (activate/deactivate)
router.patch('/:id/status', authenticateUser, updateCategoryStatus);

// DELETE /categories/:id - Delete category
router.delete('/:id', authenticateUser, deleteCategory);

export default router;