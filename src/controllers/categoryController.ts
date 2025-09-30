import { Request, Response } from 'express';
import { CategoryService } from '../services/CategoryService';
import { categoryErrorMessages } from '../utils/errorMessages';
import { handleCategoryError, validateCategoryName } from '../utils/errorHandlers';

const categoryService = new CategoryService();

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, isActive } = req.body;

    if (!validateCategoryName(name)) {
      return res.status(400).json({
        success: false,
        error: categoryErrorMessages.CATEGORY_NAME_REQUIRED
      });
    }

    const category = await categoryService.createCategory({
      name,
      description,
      isActive
    });

    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully'
    });
  } catch (error: any) {
    handleCategoryError(error, res, 'Create category');
  }
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await categoryService.getAllCategories();

    res.json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    handleCategoryError(error, res, 'Get categories');
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await categoryService.deleteCategory(id);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error: any) {
    handleCategoryError(error, res, 'Delete category');
  }
};

export const updateCategoryStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive must be a boolean value'
      });
    }

    const category = await categoryService.updateCategoryStatus(id, isActive);

    res.json({
      success: true,
      data: category,
      message: `Category ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error: any) {
    handleCategoryError(error, res, 'Update category status');
  }
};

export const getActiveCategories = async (req: Request, res: Response) => {
  try {
    const categories = await categoryService.getActiveCategories();

    res.json({
      success: true,
      data: categories
    });
  } catch (error: any) {
    handleCategoryError(error, res, 'Get active categories');
  }
};