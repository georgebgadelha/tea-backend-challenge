/**
 * Scoring algorithm types for feed ranking
 */
export enum ScoringAlgorithm {
  // Base algorithm = log10(likeCount + 1) + freshnessDecay(createdAt)
  BASE = 'base',
  // Trend surfaces posts gaining likes quickly: likes / ageInHours
  TREND = 'trend',
  // (A/B testing options: BASE and TREND only)
}

export enum SortOption {
  RELEVANCE = 'relevance',
  FRESHNESS = 'freshness',
  LIKE_COUNT = 'likeCount'
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export interface ScoringConfig {
  algorithm: ScoringAlgorithm;
  freshnessWeight: number;
  maxAgeHours: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  algorithm: ScoringAlgorithm.BASE,
  freshnessWeight: 1.0, // equal weighting
  maxAgeHours: 168 // 7 days
};

export interface PostScore {
  relevanceScore: number;
  freshnessScore: number;
  finalScore: number;
  algorithm: ScoringAlgorithm;
  ageInHours: number;
}