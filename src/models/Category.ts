import mongoose, { Schema, Document } from 'mongoose';

export interface ICategory {
  name: string;
  description: string;
  postCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryDocument extends ICategory, Document {}

const categorySchema = new Schema<CategoryDocument>({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    minLength: [2, 'Category name must be at least 2 characters'],
    maxLength: [50, 'Category name cannot exceed 50 characters'],
    match: [/^[a-zA-Z0-9\s-]+$/, 'Category name can only contain letters, numbers, spaces, and hyphens'],
  },
  description: {
    type: String,
    required: [true, 'Category description is required'],
    trim: true,
    minLength: [10, 'Category description must be at least 10 characters'],
    maxLength: [500, 'Category description cannot exceed 500 characters'],
  },
  postCount: {
    type: Number,
    default: 0,
    min: [0, 'Post count cannot be negative'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

categorySchema.index({ isActive: 1, name: 1 }); // For active categories lookup

export const Category = mongoose.model<CategoryDocument>('Category', categorySchema);