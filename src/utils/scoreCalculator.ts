import { ScoringAlgorithm, ScoringConfig, PostScore, DEFAULT_SCORING_CONFIG } from '../types/scoring';
import { logger } from './logger';

/**
 * Score calculator utility for post ranking algorithms
 * 
 * Recommended formula: (log10(likeCount+1)) + freshnessDecay(createdAt)
 * This combines relevance (popularity) with freshness (recency) equally.
 */
export class ScoreCalculator {
  
  /**
   * Calculate post score using specified algorithm
   * Recommended: LOGARITHMIC with freshnessWeight=1.0
   * Formula: relevanceScore + (freshnessWeight * freshnessScore)
   * 
   * @param likeCount Number of likes on the post
   * @param createdAt Post creation date
   * @param config Scoring configuration (uses default if not provided)
   * @returns PostScore object with detailed scoring breakdown
   */
  static calculateScore(
    likeCount: number, 
    createdAt: Date, 
    config: ScoringConfig = DEFAULT_SCORING_CONFIG
  ): PostScore {
    try {
      const now = new Date();
      const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      
      // Calculate relevance score based on algorithm
      const relevanceScore = this.calculateRelevanceScore(likeCount, config.algorithm);
      
      // Calculate freshness score with exponential decay
      const freshnessScore = this.calculateFreshnessScore(ageInHours, config.maxAgeHours);
      
      // Combine scores
      const finalScore = relevanceScore + (config.freshnessWeight * freshnessScore);
      
      const result: PostScore = {
        relevanceScore,
        freshnessScore,
        finalScore,
        algorithm: config.algorithm,
        ageInHours
      };
      
      return result;
      
    } catch (error) {
      logger.error('Error calculating post score:', error);
      throw new Error('Failed to calculate post score');
    }
  }
  
  /**
   * Calculate relevance score based on like count and algorithm
   * @param likeCount Number of likes
   * @param algorithm Scoring algorithm to use
   * @returns Relevance score
   */
  private static calculateRelevanceScore(likeCount: number, algorithm: ScoringAlgorithm): number {
    const safeLikeCount = Math.max(0, likeCount);
    
    switch (algorithm) {
      case ScoringAlgorithm.LOGARITHMIC:
        // Logarithmic scaling: log10(likes + 1)
        // Prevents posts with extremely high likes from dominating
        return Math.log10(safeLikeCount + 1);
        
      case ScoringAlgorithm.LINEAR:
        // Linear scaling: likes * 0.1
        // Direct proportional to like count but scaled down
        return safeLikeCount * 0.1;
        
      case ScoringAlgorithm.SQUARE_ROOT:
        // Square root scaling: sqrt(likes)
        // Moderate scaling between linear and logarithmic
        return Math.sqrt(safeLikeCount);
        
      default:
        logger.warn(`Unknown scoring algorithm: ${algorithm}, falling back to logarithmic`);
        return Math.log10(safeLikeCount + 1);
    }
  }
  
  /**
   * Calculate freshness score with exponential decay
   * @param ageInHours Age of post in hours
   * @param maxAgeHours Maximum age for scoring (default: 168 hours = 7 days)
   * @returns Freshness score between 0 and 1
   */
  private static calculateFreshnessScore(ageInHours: number, maxAgeHours: number): number {
    const safeAge = Math.max(0, ageInHours);
    
    if (safeAge >= maxAgeHours) {
      return 0; // Too old, no freshness bonus
    }
    
    // Exponential decay with half-life of 24 hours
    const halfLife = 24;
    const decayConstant = Math.log(2) / halfLife; // ln(2) / 24
    
    return Math.exp(-decayConstant * safeAge);
  }
  
  /**
   * Batch calculate scores for multiple posts
   * @param posts Array of posts with likeCount and createdAt
   * @param config Scoring configuration
   * @returns Array of posts with calculated scores
   */
  static batchCalculateScores<T extends { likeCount: number; createdAt: Date }>(
    posts: T[], 
    config: ScoringConfig = DEFAULT_SCORING_CONFIG
  ): (T & { score: PostScore })[] {
    return posts.map(post => ({
      ...post,
      score: this.calculateScore(post.likeCount, post.createdAt, config)
    }));
  }
  
  /**
   * Get scoring algorithm performance metrics for testing
   * @param posts Array of posts to analyze
   * @param algorithms Array of algorithms to test
   * @returns Performance metrics for each algorithm
   */
  static getAlgorithmMetrics<T extends { likeCount: number; createdAt: Date }>(
    posts: T[], 
    algorithms: ScoringAlgorithm[] = Object.values(ScoringAlgorithm)
  ): Record<ScoringAlgorithm, { avgScore: number; maxScore: number; minScore: number; variance: number }> {
    const metrics: any = {};
    
    algorithms.forEach(algorithm => {
      const config: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, algorithm };
      const scores = posts.map(post => 
        this.calculateScore(post.likeCount, post.createdAt, config).finalScore
      );
      
      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;
      
      metrics[algorithm] = { avgScore, maxScore, minScore, variance };
    });
    
    return metrics;
  }
}