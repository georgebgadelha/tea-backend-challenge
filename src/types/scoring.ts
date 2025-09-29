/**
 * Scoring algorithm types for feed ranking
 */
export enum ScoringAlgorithm {
  LOGARITHMIC = 'logarithmic',
  LINEAR = 'linear',
  SQUARE_ROOT = 'square_root'
}

export enum SortOption {
  RELEVANCE = 'relevance',
  FRESHNESS = 'freshness',
  CREATED_AT = 'createdAt',
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
  algorithm: ScoringAlgorithm.LOGARITHMIC,
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