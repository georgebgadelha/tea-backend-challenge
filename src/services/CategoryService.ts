import { Category } from '../models/Category';
import { logger } from '../utils/logger';
import { categoryErrorMessages } from '../utils/errorMessages';

export interface CreateCategoryData {
  name: string;
  description?: string;
  isActive?: boolean;
}

export class CategoryService {
  async createCategory(data: CreateCategoryData) {
    const { name, description, isActive = true } = data;

    // Check if category already exists
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      throw new Error(categoryErrorMessages.CATEGORY_ALREADY_EXISTS);
    }

    const category = new Category({
      name: name.trim(),
      description: description?.trim(),
      isActive
    });

    await category.save();

    logger.info('Category created successfully', {
      categoryId: category._id,
      name: category.name
    });

    return category;
  }

  async getAllCategories() {
    const categories = await Category.find()
      .select('_id name description postCount isActive createdAt')
      .sort({ name: 1 });

    return categories;
  }

  async deleteCategory(categoryId: string) {
    const category = await Category.findById(categoryId);
    
    if (!category) {
      throw new Error(categoryErrorMessages.CATEGORY_NOT_FOUND);
    }

    if (category.postCount > 0) {
      throw new Error(categoryErrorMessages.CATEGORY_HAS_POSTS);
    }

    await Category.findByIdAndDelete(categoryId);

    logger.info('Category deleted successfully', {
      categoryId,
      name: category.name
    });

    return { message: 'Category deleted successfully' };
  }

  async updateCategoryStatus(categoryId: string, isActive: boolean) {
    const category = await Category.findById(categoryId);
    
    if (!category) {
      throw new Error(categoryErrorMessages.CATEGORY_NOT_FOUND);
    }

    category.isActive = isActive;
    await category.save();

    logger.info('Category status updated', {
      categoryId,
      name: category.name,
      isActive
    });

    return category;
  }

  async getActiveCategories() {
    const categories = await Category.find({ isActive: true })
      .select('_id name description postCount isActive createdAt')
      .sort({ name: 1 });

    return categories;
  }
}