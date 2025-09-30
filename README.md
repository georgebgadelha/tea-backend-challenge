# Tea Backend Challenge

A scalable post feed API with relevance scoring, Redis caching, and transaction support.

## Quick Start

```bash
# Setup
cp .env.example .env
npm install
npm run build

# Run with Docker (recommended)
docker compose up -d

# API will be available at http://localhost:3000

# Seed command
npm run seed:docker

# Some quick commands to improve testing
npm run docker:up # Same as docker compose up
npm run docker:logs # Check docker logs
npm run docker:down # Same as docker compose down
```

There are some commands which will help you understand better, which is for example the api docs. For this case run `npm run export:swagger`,
so you can have a `swagger.json` file to import on your Postman/API platform.

**💡 REMEMBER THAT TO RUN THE SEED SCRIPT YOU MUST TYPE 💡** `npm run seed:docker` (after running docker compose up)

## Scoring Formula

The scoring algorithm uses: `log10(likeCount + 1) + freshnessDecay(createdAt)`

### Why This Formula

Even though I was not familiar with ranking/scoring on social media, I did some research and decided that due to some time limitations and scope of this project, I would use the recommended formula since it integrated well enough with my models and also the research showed me that:

1. **Logarithmic like scaling**: Prevents posts with massive like counts from completely dominating the feed. The difference between 10 and 100 likes is significant, but between 10000 and 100000 is less dramatic.

2. **Exponential freshness decay**: Uses `exp(-ln(2) / 24 * ageInHours)` which creates a half-life of 24 hours. Posts lose half their freshness score every day, ensuring recent content stays relevant.

I could understand while implementing this project that this approach mirrors real-world social media algorithms where viral content can stay relevant for days, but eventually gives way to newer posts.

## Redis Usage

Redis serves three primary functions:

### 1. Hot Posts Ranking
- Maintains sorted sets for globally hot posts and per-category hot posts
- Updates scores in real-time when posts receive likes
- Removes posts below minimum score thresholds automatically
- Enables fast retrieval of top-performing content

### 2. Feed Caching
- Caches feed results for 5 minutes to reduce database load
- Uses versioning system to invalidate stale caches when post scores change
- Supports pagination by slicing cached results when possible

### 3. Like Deduplication + Avoid massive MongoDB calls
- Temporarily caches user like status to prevent rapid duplicate submissions
- Works alongside database unique constraints for comprehensive protection

## Database Indexes

### Post Collection
- `{ categoryId: 1, score: -1, createdAt: -1 }` - Category feeds with relevance sorting
- `{ categoryId: 1, likeCount: -1, createdAt: -1 }` - Category feeds with like sorting
- `{ categoryId: 1, createdAt: -1 }` - Category feeds with time sorting
- `{ score: -1, createdAt: -1 }` - Global relevance sorting
- `{ likeCount: -1, createdAt: -1 }` - Global like sorting
- `{ createdAt: -1 }` - Global time sorting

### Category Collection
- `{ isActive: 1, name: 1 }` - Active categories filtering in aggregation pipelines
- `{ isActive: 1, postCount: -1 }` - Popular categories ranking

### Like Collection
- `{ userId: 1, postId: 1 }` - Unique constraint preventing duplicate likes

### Index Strategy Reasoning

The compound indexes as already mentioned was to avoid duplicate likes. The time-based ones ensures consistent ordering across all feeds. All indexes include `createdAt` to enable efficient pagination and maintain deterministic sort order.

## Trade-offs Made

### 1. Real-time vs Performance
- **Choice**: Near real-time scoring with 5-minute cache windows
- **Trade-off**: Slightly stale feed results for better performance
- **Reasoning**: Most users won't notice 5-minute delays, but will notice slow feeds

### 2. Score Calculation Complexity
- **Choice**: Simple logarithmic + exponential formula
- **Trade-off**: Less sophisticated than ML-based recommendations
- **Reasoning**: Short time to deliver, predictable, debuggable, and fast to compute

### 3. Redis Memory Usage
- **Choice**: Cache full feed results rather than just post IDs
- **Trade-off**: Higher memory usage for faster response times
- **Reasoning**: Memory is cheaper than repeated database queries

### 4. Transaction Requirements
- **Choice**: Mandatory MongoDB transactions for data consistency
- **Trade-off**: Requires replica set setup, more complex deployment
- **Reasoning**: Data integrity is critical for like counts and feed consistency

## What I'd Do With More Time

1. **Add JSDocs** to each important method of the project
2. **Add connection pooling** and query optimization for high-traffic scenarios
3. **Implement cursor-based pagination** for more efficient large dataset traversal
4. **Event-driven architecture** using message queues for async processing
5. **A/B testing framework** for scoring algorithm experimentation. (You will notice on the code I have two formulas but I had to prioritize the must-have and not nice to have)
6. **Enhanced security** with rate limiting, input validation, and audit logging
7. **Automated performance testing** and load testing in CI/CD pipeline. (This one would also detects potential fixes/improvements for v2)

## Architecture

The system uses a layered architecture:
- **Controllers**: Handle HTTP requests and validation
- **Services**: Business logic and external integrations
- **Models**: Data layer with MongoDB schemas
- **Redis Integration**: Caching and performance optimization
- **Middleware**: Authentication, error handling, and request processing
- **Utils**: Common logger, error messages to avoid typos
