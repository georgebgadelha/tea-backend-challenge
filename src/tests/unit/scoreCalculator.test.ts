import { ScoreCalculator } from '../../utils/scoreCalculator';
import { ScoringAlgorithm, DEFAULT_SCORING_CONFIG } from '../../types/scoring';

describe('ScoreCalculator - Recommended Formula', () => {
  describe('Recommended algorithm: (log10(likeCount+1)) + freshnessDecay(createdAt)', () => {
    it('should implement the exact recommended formula', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - (1 * 60 * 60 * 1000));
      
      // Test with 99 likes (log10(100) = 2.0) and 1 hour age
      const result = ScoreCalculator.calculateScore(99, oneHourAgo, DEFAULT_SCORING_CONFIG);
      
      // Expected: log10(99+1) + freshnessDecay(1 hour)
      const expectedRelevance = Math.log10(100); // = 2.0
      const expectedFreshness = Math.exp(-Math.log(2) / 24 * 1); // ≈ 0.971
      const expectedTotal = expectedRelevance + expectedFreshness; // ≈ 2.971
      
  expect(result.algorithm).toBe(ScoringAlgorithm.BASE);
      expect(result.relevanceScore).toBeCloseTo(expectedRelevance, 3);
      expect(result.freshnessScore).toBeCloseTo(expectedFreshness, 3);
      expect(result.finalScore).toBeCloseTo(expectedTotal, 3);
    });

    it('should give higher scores to posts with more likes', () => {
      const now = new Date();
      
      const lowLikes = ScoreCalculator.calculateScore(9, now, DEFAULT_SCORING_CONFIG); // log10(10) = 1.0
      const highLikes = ScoreCalculator.calculateScore(99, now, DEFAULT_SCORING_CONFIG); // log10(100) = 2.0
      
      expect(highLikes.relevanceScore).toBeGreaterThan(lowLikes.relevanceScore);
      expect(highLikes.finalScore).toBeGreaterThan(lowLikes.finalScore);
    });

    it('should give higher scores to newer posts', () => {
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
      
      const newPost = ScoreCalculator.calculateScore(10, now, DEFAULT_SCORING_CONFIG);
      const oldPost = ScoreCalculator.calculateScore(10, twelveHoursAgo, DEFAULT_SCORING_CONFIG);
      
      expect(newPost.freshnessScore).toBeGreaterThan(oldPost.freshnessScore);
      expect(newPost.finalScore).toBeGreaterThan(oldPost.finalScore);
    });

    it('should balance likes and freshness as intended', () => {
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
      
      // New post with fewer likes vs older post with more likes
      const newPostFewLikes = ScoreCalculator.calculateScore(10, now, DEFAULT_SCORING_CONFIG);
      const oldPostManyLikes = ScoreCalculator.calculateScore(1000, sixHoursAgo, DEFAULT_SCORING_CONFIG);
      
      // Both should have meaningful scores, demonstrating the balance
      expect(newPostFewLikes.finalScore).toBeGreaterThan(2); // ~1.0 + ~1.0
      expect(oldPostManyLikes.finalScore).toBeGreaterThan(3); // ~3.0 + ~0.8
      
      // The older post with many likes should still rank higher
      expect(oldPostManyLikes.finalScore).toBeGreaterThan(newPostFewLikes.finalScore);
    });
  });
});