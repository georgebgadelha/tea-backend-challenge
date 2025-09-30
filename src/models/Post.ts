import mongoose, { Schema, Document } from 'mongoose';
import { ScoreCalculator } from '../utils/scoreCalculator';
import { DEFAULT_SCORING_CONFIG } from '../types/scoring';

export interface IPost {
  title: string;
  content: string;
  categoryId: mongoose.Types.ObjectId;
  authorId: string;
  likeCount: number;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostDocument extends IPost, Document {}

const postSchema = new Schema<PostDocument>({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    minLength: [5, 'Post title must be at least 5 characters'],
    maxLength: [200, 'Post title cannot exceed 200 characters'],
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    minLength: [20, 'Post content must be at least 20 characters'],
    maxLength: [50000, 'Post content cannot exceed 50,000 characters'],
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
  },
  authorId: {
    type: String,
    required: [true, 'Author ID is required'],
    trim: true,
    minLength: [1, 'Author ID cannot be empty'],
    maxLength: [100, 'Author ID cannot exceed 100 characters'],
  },
  likeCount: {
    type: Number,
    default: 0,
    min: [0, 'Like count cannot be negative'],
  },
  score: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Calculate score before saving
postSchema.pre('save', function(next) {
  if (this.isModified('likeCount') || this.isNew) {
    try {
      const scoreResult = ScoreCalculator.calculateScore(
        this.likeCount, 
        this.createdAt || new Date(), 
        DEFAULT_SCORING_CONFIG
      );
      this.score = scoreResult.finalScore;
    } catch (error) {
      this.score = 0;
    }
  }
  next();
});

// Populates category details on post fetch
postSchema.virtual('category', {
  ref: 'Category',
  localField: 'categoryId',
  foreignField: '_id',
  justOne: true,
});

postSchema.index({ categoryId: 1, score: -1, createdAt: -1 }); // For relevance/freshness sorting by category
postSchema.index({ categoryId: 1, likeCount: -1, createdAt: -1 }); // For like count sorting by category
postSchema.index({ categoryId: 1, createdAt: -1 }); // For time-based sorting by category
postSchema.index({ score: -1, createdAt: -1 }); // For global relevance/freshness sorting
postSchema.index({ likeCount: -1, createdAt: -1 }); // For global like count sorting
postSchema.index({ createdAt: -1 }); // For global time-based sorting

export const Post = mongoose.model<PostDocument>('Post', postSchema);