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

// Default distribution (sum = 5000)
const DEFAULT_DISTRIBUTION = [2500, 1000, 500, 750, 250];

// Allow overriding distribution with env var (CSV of numbers), e.g. "2500,1000,500,750,250"
const envDist = process.env.SEED_DISTRIBUTION;
const DISTRIBUTION: number[] = envDist
	? envDist.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n) && n > 0)
	: DEFAULT_DISTRIBUTION;

const TOTAL_CATEGORIES = DISTRIBUTION.length;
const TOTAL_POSTS = DISTRIBUTION.reduce((a, b) => a + b, 0);
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

async function createPosts(categories: any[], distribution: number[]) {
	const posts: any[] = [];
	const lorem = (i: number) => `Seeded post ${i} - ${'lorem ipsum '.repeat(8)}`;

	for (let c = 0; c < categories.length; c++) {
		const category = categories[c];
		let toCreate = distribution[c] || 0;
		let created = 0;

		while (created < toCreate) {
			const batchSize = Math.min(POST_BATCH, toCreate - created);
			const batch: any[] = [];
			for (let i = 0; i < batchSize; i++) {
				const idx = posts.length + 1;
				const createdAt = randomPastDate(8); // spread across 90 days for variety

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
			console.log(`Inserted posts for ${category.name}: ${created}/${toCreate}`);
		}
	}

	console.log(`Total inserted posts: ${posts.length}`);
	return posts;
}

async function createLikesForPosts(posts: any[]) {
	// We'll generate likes per post according to a simple distribution:
	// - 3% of posts: hot (100-2000 likes)
	// - 12% of posts: medium (10-100 likes)
	// - rest: low (0-9 likes)
	// Additional constraint: every user must like at least one post in the largest category
	// and at least one post in a second category (different from the largest).

	const likesToInsert: any[] = [];
	let totalLikes = 0;

	// Organize posts by category for quick sampling
	const postsByCategory: Record<string, any[]> = {};
	for (const p of posts) {
		const cid = p.categoryId.toString();
		postsByCategory[cid] = postsByCategory[cid] || [];
		postsByCategory[cid].push(p);
	}

	// Identify largest category id (the one with most posts from DISTRIBUTION)
	// We assume categories were created in the same order as DISTRIBUTION
	let largestCategoryIndex = 0;
	for (let i = 1; i < DISTRIBUTION.length; i++) {
		if (DISTRIBUTION[i] > DISTRIBUTION[largestCategoryIndex]) largestCategoryIndex = i;
	}
	// Map categories array order to ids by finding a representative post in each distribution slot
	const categoryIdsOrdered = Object.keys(postsByCategory);
	const largestCategoryId = categoryIdsOrdered[largestCategoryIndex] || categoryIdsOrdered[0];

	// Keep track of user->set of categories they liked and user/post pairs to avoid duplicates
	const userCategories: Record<string, Set<string>> = {};
	const existingLikePairs = new Set<string>(); // `userId|postId`

	// First, ensure every user likes at least one post in largestCategory and at least one in another category
	for (let u = 1; u <= TOTAL_USERS; u++) {
		const userId = `seed_user_${u}`;
		userCategories[userId] = new Set();

		// pick one post in largest category
		const largestPosts = postsByCategory[largestCategoryId] || [];
		if (largestPosts.length > 0) {
			const p = largestPosts[randomInt(0, largestPosts.length - 1)];
			const key = `${userId}|${p._id.toString()}`;
			if (!existingLikePairs.has(key)) {
				likesToInsert.push({ userId, postId: p._id, createdAt: randomPastDate(30) });
				existingLikePairs.add(key);
				userCategories[userId].add(largestCategoryId);
				totalLikes++;
			}
		}

		// pick a second category (different from largest)
		const otherCategoryIds = categoryIdsOrdered.filter(id => id !== largestCategoryId);
		if (otherCategoryIds.length > 0) {
			const otherCat = otherCategoryIds[randomInt(0, otherCategoryIds.length - 1)];
			const otherPosts = postsByCategory[otherCat] || [];
			if (otherPosts.length > 0) {
				const p2 = otherPosts[randomInt(0, otherPosts.length - 1)];
				const key2 = `${userId}|${p2._id.toString()}`;
				if (!existingLikePairs.has(key2)) {
					likesToInsert.push({ userId, postId: p2._id, createdAt: randomPastDate(30) });
					existingLikePairs.add(key2);
					userCategories[userId].add(otherCat);
					totalLikes++;
				}
			}
		}

		// flush in batches to avoid growing memory too much
		if (likesToInsert.length >= LIKE_BATCH) {
			await Like.insertMany(likesToInsert.splice(0));
		}
	}

	// Now, for each post, generate additional likes according to the original distribution
	// but subtract any likes already created for that post from mandatory phase
	const likesNeededPerPost: Map<string, number> = new Map();
	for (const post of posts) {
		const r = Math.random();
		let likes = 0;
		if (r < 0.03) likes = randomInt(100, 2000);
		else if (r < 0.15) likes = randomInt(10, 100);
		else likes = randomInt(0, 9);

		likesNeededPerPost.set(post._id.toString(), likes);
	}

	// Count how many mandatory likes we already have per post
	const mandatoryCounts: Record<string, number> = {};
	for (const pair of existingLikePairs) {
		const [, postId] = pair.split('|');
		mandatoryCounts[postId] = (mandatoryCounts[postId] || 0) + 1;
	}

	// Fill remaining likes per post
	for (const post of posts) {
		const pid = post._id.toString();
		const needed = likesNeededPerPost.get(pid) || 0;
		const already = mandatoryCounts[pid] || 0;
		let remaining = needed - already;
		if (remaining <= 0) continue;

		let attempts = 0;
		while (remaining > 0) {
			attempts++;
			// pick a random user
			const userNum = randomInt(1, TOTAL_USERS);
			const userId = `seed_user_${userNum}`;
			const key = `${userId}|${pid}`;
			if (existingLikePairs.has(key)) {
				// avoid duplicates
			} else {
				likesToInsert.push({ userId, postId: post._id, createdAt: randomPastDate(30) });
				existingLikePairs.add(key);
				userCategories[userId] = userCategories[userId] || new Set();
				userCategories[userId].add(post.categoryId.toString());
				totalLikes++;
				remaining--;
			}

			// flush occasionally
			if (likesToInsert.length >= LIKE_BATCH) {
				await Like.insertMany(likesToInsert.splice(0));
			}

			// safety to avoid infinite loops in degenerate cases
			if (attempts > needed * 10) break;
		}
	}

	// Insert any remaining likes
	if (likesToInsert.length > 0) {
		await Like.insertMany(likesToInsert);
	}

	console.log(`Inserted total likes (including mandatory per-user likes): ${totalLikes}`);
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

		console.log(`Creating posts with distribution: ${DISTRIBUTION.join(', ')} (total ${TOTAL_POSTS})`);
		const posts = await createPosts(categories, DISTRIBUTION);

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
