import { connectDatabase, disconnectDatabase } from '../config/database';
import { Category } from '../models/Category';
import { Post } from '../models/Post';
import { Like } from '../models/Like';
import { ScoreCalculator } from '../utils/scoreCalculator';
import mongoose from 'mongoose';

/**
 * DB seeder for local/dev use.
 *
 * Features:
 * - Create categories (default: 10)
 * - Create posts (default: 5000)
 * - Create likes distributed so some posts become "hot"
 * - Update posts with likeCount and computed score
 *
 * Usage:
 *   npm run seed
 *
 * Environment variables:
 *   SEED_POSTS (default 5000)
 *   SEED_CATEGORIES (default 10)
 *   SEED_USERS (approx. unique users for likes, default 20000)
 */

const TOTAL_POSTS = parseInt(process.env.SEED_POSTS || '5000', 10);
const TOTAL_CATEGORIES = parseInt(process.env.SEED_CATEGORIES || '10', 10);
const TOTAL_USERS = parseInt(process.env.SEED_USERS || '20000', 10);

const POST_BATCH = 500; // insertMany batch size
const LIKE_BATCH = 2000;

function randomInt(min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPastDate(maxDays = 30) {
	const now = Date.now();
	const past = now - Math.floor(Math.random() * maxDays * 24 * 60 * 60 * 1000);
	return new Date(past);
}

async function ensureCategories(count: number) {
	const categories: mongoose.Document[] = [];
	for (let i = 1; i <= count; i++) {
		const name = `category-${i}`;
		const description = `Auto-generated seed category ${i}`;
		// Upsert category to avoid duplicates when re-running
		const cat = await Category.findOneAndUpdate(
			{ name },
			{ $setOnInsert: { name, description, isActive: true, postCount: 0 } },
			{ upsert: true, new: true }
		);
		categories.push(cat);
	}
	return categories;
}

async function createPosts(categories: any[], totalPosts: number) {
	const posts: any[] = [];
	let created = 0;

	const lorem = (i: number) => `Seeded post ${i} - ${'lorem ipsum '.repeat(8)}`;

	while (created < totalPosts) {
		const batch: any[] = [];
		const batchSize = Math.min(POST_BATCH, totalPosts - created);

		for (let i = 0; i < batchSize; i++) {
			const idx = created + i + 1;
			const category = categories[idx % categories.length];
			const createdAt = randomPastDate(30);

			batch.push({
				title: `Seeded Post #${idx}`,
				content: lorem(idx),
				categoryId: category._id,
				authorId: `seed_user_${randomInt(1, TOTAL_USERS)}`,
				likeCount: 0,
				score: 0,
				createdAt,
				updatedAt: createdAt,
			});
		}

		const inserted = await Post.insertMany(batch, { ordered: false });
		posts.push(...inserted.map((p: any) => p.toObject()));
		created += batchSize;
		console.log(`Inserted posts: ${created}/${totalPosts}`);
	}

	return posts;
}

async function createLikesForPosts(posts: any[]) {
	// We'll generate likes per post according to a simple distribution:
	// - 3% of posts: hot (100-2000 likes)
	// - 12% of posts: medium (10-100 likes)
	// - rest: low (0-9 likes)

	const likesToInsert: any[] = [];
	let totalLikes = 0;
	let userCounter = 1;

	for (const post of posts) {
		const r = Math.random();
		let likes = 0;
		if (r < 0.03) likes = randomInt(100, 2000);
		else if (r < 0.15) likes = randomInt(10, 100);
		else likes = randomInt(0, 9);

		totalLikes += likes;

		for (let j = 0; j < likes; j++) {
			const userId = `seed_user_${(userCounter % TOTAL_USERS) + 1}`;
			likesToInsert.push({ userId, postId: post._id, createdAt: randomPastDate(30) });
			userCounter++;

			// flush likes in batches
			if (likesToInsert.length >= LIKE_BATCH) {
				await Like.insertMany(likesToInsert.splice(0));
			}
		}
	}

	// Insert remaining likes
	if (likesToInsert.length > 0) {
		await Like.insertMany(likesToInsert);
	}

	console.log(`Inserted total likes: ${totalLikes}`);
	return totalLikes;
}

async function updatePostLikeCountsAndScores() {
	// Aggregate like counts per post
	const counts = await Like.aggregate([
		{ $group: { _id: '$postId', count: { $sum: 1 } } }
	]);

	if (!counts || counts.length === 0) return 0;

	// Prepare bulk operations to update posts
	const bulkOps = counts.map((c: any) => {
		const likeCount = c.count;
		const postId = c._id;
		// We'll compute score using ScoreCalculator based on likeCount and post's createdAt
		return {
			updateOne: {
				filter: { _id: postId },
				update: [], // placeholder - we'll fill after fetching createdAt
			}
		};
	});

	// Fetch createdAt for all posts in counts
	const postIds = counts.map((c: any) => c._id);
	const posts = await Post.find({ _id: { $in: postIds } }).select('_id createdAt');
	const createdAtMap: Record<string, Date> = {};
	posts.forEach(p => { createdAtMap[p._id.toString()] = p.createdAt; });

	const finalBulk: any[] = [];
	counts.forEach((c: any) => {
		const postId = c._id;
		const likeCount = c.count;
		const createdAt = createdAtMap[postId.toString()] || new Date();
		const score = ScoreCalculator.calculateScore(likeCount, createdAt).finalScore;

		finalBulk.push({
			updateOne: {
				filter: { _id: postId },
				update: { $set: { likeCount, score } }
			}
		});
	});

	// Execute bulk in chunks
	const CHUNK = 1000;
	for (let i = 0; i < finalBulk.length; i += CHUNK) {
		const chunk = finalBulk.slice(i, i + CHUNK);
		await Post.bulkWrite(chunk);
		console.log(`Updated post likeCount+score for ${Math.min(i + CHUNK, finalBulk.length)}/${finalBulk.length}`);
	}

	return finalBulk.length;
}

async function updateCategoryCounts() {
	// Recompute postCount per category
	const agg = await Post.aggregate([
		{ $group: { _id: '$categoryId', count: { $sum: 1 } } }
	]);

	const ops = agg.map((a: any) => ({
		updateOne: {
			filter: { _id: a._id },
			update: { $set: { postCount: a.count } }
		}
	}));

	if (ops.length > 0) {
		await Category.bulkWrite(ops);
	}

	console.log('Updated category post counts');
}

async function run() {
	try {
		console.log('Connecting to database...');
		await connectDatabase();

		console.log(`Ensuring ${TOTAL_CATEGORIES} categories`);
		const categories = await ensureCategories(TOTAL_CATEGORIES);

		console.log(`Creating ${TOTAL_POSTS} posts (batch ${POST_BATCH})`);
		const posts = await createPosts(categories, TOTAL_POSTS);

		console.log('Creating likes (this can take a while)');
		await createLikesForPosts(posts);

		console.log('Updating posts with like counts and recalculated scores');
		const updated = await updatePostLikeCountsAndScores();
		console.log(`Updated ${updated} posts with like counts and scores`);

		await updateCategoryCounts();

		console.log('Seeding complete');
	} catch (error) {
		console.error('Seeding failed:', error);
	} finally {
		await disconnectDatabase();
		process.exit(0);
	}
}

if (require.main === module) {
	run();
}
