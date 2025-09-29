import mongoose, { Schema, Document } from 'mongoose';

export interface ILike {
  userId: string;
  postId: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface LikeDocument extends ILike, Document {}

const likeSchema = new Schema<LikeDocument>({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    trim: true,
    minLength: [1, 'User ID cannot be empty'],
    maxLength: [100, 'User ID cannot exceed 100 characters'],
  },
  postId: {
    type: Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Post ID is required'],
    validate: {
      validator: async function(postId: mongoose.Types.ObjectId) {
        const Post = mongoose.model('Post');
        const post = await Post.findById(postId);
        return !!post;
      },
      message: 'Post does not exist',
    },
  },
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only need createdAt for likes
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for populated post
likeSchema.virtual('post', {
  ref: 'Post',
  localField: 'postId',
  foreignField: '_id',
  justOne: true,
});

// Compound index to prevent duplicate likes from same user)
likeSchema.index({ userId: 1, postId: 1 }, { unique: true });

export const Like = mongoose.model<LikeDocument>('Like', likeSchema);