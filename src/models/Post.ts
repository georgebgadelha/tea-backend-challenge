import mongoose, { Schema, Document } from 'mongoose';

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
    validate: {
      validator: async function(categoryId: mongoose.Types.ObjectId) {
        const Category = mongoose.model('Category');
        const category = await Category.findById(categoryId);
        return !!category;
      },
      message: 'Category does not exist',
    },
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
    this.score = calculatePostScore(this.likeCount, this.createdAt);
  }
  next();
});

// Virtual for populated category
postSchema.virtual('category', {
  ref: 'Category',
  localField: 'categoryId',
  foreignField: '_id',
  justOne: true,
});

// Score calculation function
function calculatePostScore(likeCount: number, createdAt: Date): number {
  // Like score: log10(likes + 1) to prevent log(0)
  const likeScore = Math.log10(likeCount + 1);
  
  // Freshness score: decay over 30 days
  const ageInDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const freshnessScore = Math.max(0, 1 - (ageInDays / 30));
  
  // Combined score
  return Number((likeScore + freshnessScore).toFixed(4));
}

export const Post = mongoose.model<PostDocument>('Post', postSchema);