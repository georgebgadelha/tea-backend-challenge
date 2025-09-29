import { ScoreCalculator } from '../utils/scoreCalculator';
import { ScoringAlgorithm, ScoringConfig, DEFAULT_SCORING_CONFIG } from '../types/scoring';

/**
 * Script de Comparação de Algoritmos de Feed
 * 
 * Este script demonstra e compara os algoritmos suportados:
 * 1. BASE (recomendado): log10(likes + 1) + freshnessDecay(age)
 * 2. TREND: likes / (ageInHours + 1)
 * 
 * Usage: npx ts-node src/scripts/compare-scoring-algorithms.ts
 */

interface SamplePost {
  title: string;
  likeCount: number;
  ageInHours: number;
  createdAt: Date;
}

interface ComparisonResult {
  post: SamplePost;
  scores: Record<ScoringAlgorithm, {
    relevanceScore: number;
    freshnessScore: number;
    finalScore: number;
    algorithm: ScoringAlgorithm;
  }>;
}

/**
 * Criar posts de exemplo para teste
 */
function createSamplePosts(): SamplePost[] {
  const now = new Date();
  
  return [
    {
      title: "Breaking News Post",
      likeCount: 500,
      ageInHours: 2,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000)
    },
    {
      title: "Popular Tutorial", 
      likeCount: 150,
      ageInHours: 12,
      createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000)
    },
    {
      title: "Viral Meme",
      likeCount: 1000,
      ageInHours: 6,
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000)
    },
    {
      title: "Fresh Discussion",
      likeCount: 25,
      ageInHours: 1,
      createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000)
    },
    {
      title: "Yesterday's Article",
      likeCount: 80,
      ageInHours: 20,
      createdAt: new Date(now.getTime() - 20 * 60 * 60 * 1000)
    },
    {
      title: "Week Old Post",
      likeCount: 200,
      ageInHours: 168,
      createdAt: new Date(now.getTime() - 168 * 60 * 60 * 1000)
    },
    {
      title: "New Post No Likes",
      likeCount: 0,
      ageInHours: 0.5,
      createdAt: new Date(now.getTime() - 0.5 * 60 * 60 * 1000)
    },
    {
      title: "Moderate Engagement",
      likeCount: 50,
      ageInHours: 8,
      createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000)
    },
    {
      title: "Old Viral Content",
      likeCount: 2000,
      ageInHours: 72,
      createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000)
    },
    {
      title: "Recent Quality Post",
      likeCount: 75,
      ageInHours: 4,
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000)
    }
  ];
}

/**
 * Comparar todos os algoritmos para um post
 */
function comparePostScores(post: SamplePost): ComparisonResult {
  const algorithms = Object.values(ScoringAlgorithm);
  const scores: Record<string, any> = {};
  
  algorithms.forEach(algorithm => {
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      algorithm
    };
    
    const score = ScoreCalculator.calculateScore(post.likeCount, post.createdAt, config);
    scores[algorithm] = {
      relevanceScore: score.relevanceScore,
      freshnessScore: score.freshnessScore,
      finalScore: score.finalScore,
      algorithm: score.algorithm
    };
  });
  
  return {
    post,
    scores: scores as Record<ScoringAlgorithm, any>
  };
}

/**
 * Exibir resultados em tabela formatada
 */
function displayResults(results: ComparisonResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('🎯 RESULTADOS DA COMPARAÇÃO DE ALGORITMOS DE FEED');
  console.log('='.repeat(120));
  
  results.forEach((result, index) => {
    const { post, scores } = result;
    
    console.log(`\n📝 Post ${index + 1}: "${post.title}"`);
    console.log(`   Likes: ${post.likeCount} | Idade: ${post.ageInHours}h`);
    console.log('   ' + '-'.repeat(90));
    
    // Header
    console.log('   Algoritmo     | Relevância | Frescor   | Score Final | Fórmula');
    console.log('   ' + '-'.repeat(90));
    
  // BASE (Recomendado)
  const base = scores[ScoringAlgorithm.BASE];
  console.log(`   🏆 BASE        | ${base.relevanceScore.toFixed(4).padStart(9)} | ${base.freshnessScore.toFixed(4).padStart(8)} | ${base.finalScore.toFixed(4).padStart(10)} | log10(${post.likeCount}+1) + decay`);

  // TREND
  const trend = scores[ScoringAlgorithm.TREND];
  console.log(`   📈 TREND       | ${trend.relevanceScore.toFixed(4).padStart(9)} | ${trend.freshnessScore.toFixed(4).padStart(8)} | ${trend.finalScore.toFixed(4).padStart(10)} | likes/(age+1)`);

  });
}

/**
 * Analisar performance dos algoritmos
 */
function analyzePerformance(results: ComparisonResult[]): Record<ScoringAlgorithm, any> {
  console.log('\n' + '='.repeat(120));
  console.log('📊 ANÁLISE DE PERFORMANCE DOS ALGORITMOS');
  console.log('='.repeat(120));
  
  const algorithms = Object.values(ScoringAlgorithm);
  const analysis: Record<string, any> = {};
  
  algorithms.forEach(algorithm => {
    const scores = results.map(result => result.scores[algorithm].finalScore);
    
    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    analysis[algorithm] = {
      avg: Number(avg.toFixed(4)),
      max: Number(max.toFixed(4)),
      min: Number(min.toFixed(4)),
      variance: Number(variance.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4)),
      range: Number((max - min).toFixed(4))
    };
  });
  
  // Exibir análise
  console.log('\nAlgoritmo     | Score Médio | Score Max | Score Min | Desvio Pad | Amplitude | Características');
  console.log('-'.repeat(120));
  
  const baseAnalysis = analysis[ScoringAlgorithm.BASE];
  console.log(`🏆 BASE        | ${baseAnalysis.avg.toString().padStart(10)} | ${baseAnalysis.max.toString().padStart(8)} | ${baseAnalysis.min.toString().padStart(8)} | ${baseAnalysis.stdDev.toString().padStart(9)} | ${baseAnalysis.range.toString().padStart(8)} | Balanceado, previne dominância`);

  const trendAnalysis = analysis[ScoringAlgorithm.TREND];
  console.log(`📈 TREND       | ${trendAnalysis.avg.toString().padStart(10)} | ${trendAnalysis.max.toString().padStart(8)} | ${trendAnalysis.min.toString().padStart(8)} | ${trendAnalysis.stdDev.toString().padStart(9)} | ${trendAnalysis.range.toString().padStart(8)} | Surfaces fast-rising posts`);

  
  return analysis as Record<ScoringAlgorithm, any>;
}

/**
 * Mostrar diferenças de ranking
 */
function showRankingDifferences(results: ComparisonResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('🏆 COMPARAÇÃO DE RANKINGS - Top Posts por Algoritmo');
  console.log('='.repeat(120));
  
  const algorithms = Object.values(ScoringAlgorithm);
  
  algorithms.forEach(algorithm => {
    console.log(`\n${algorithm.toUpperCase()} Algorithm Rankings:`);
    
    const rankedPosts = results.map((result, index) => ({
      ...result.post,
      originalIndex: index + 1,
      score: result.scores[algorithm].finalScore
    })).sort((a, b) => b.score - a.score);
    
    rankedPosts.slice(0, 5).forEach((post, rank) => {
      console.log(`  ${rank + 1}. "${post.title}" (Score: ${post.score.toFixed(4)}) - ${post.likeCount} likes, ${post.ageInHours}h`);
    });
  });
}

/**
 * Demonstrar fórmula recomendada especificamente
 */
function demonstrateRecommendedFormula(): void {
  console.log('\n' + '='.repeat(120));
  console.log('🎯 DEMONSTRAÇÃO DA FÓRMULA RECOMENDADA');
  console.log('Fórmula: (log10(likeCount + 1)) + freshnessDecay(createdAt)');
  console.log('='.repeat(120));
  
  const examples = [
    { likes: 0, hours: 1 },
    { likes: 10, hours: 2 },
    { likes: 100, hours: 12 },
    { likes: 1000, hours: 24 },
    { likes: 10000, hours: 48 }
  ];
  
  console.log('\nExemplos de cálculo passo a passo:');
  console.log('-'.repeat(80));
  
  examples.forEach(example => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - example.hours * 60 * 60 * 1000);
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      algorithm: ScoringAlgorithm.BASE
    };
    
    const score = ScoreCalculator.calculateScore(example.likes, createdAt, config);
    
    console.log(`\n📊 ${example.likes} likes, ${example.hours} horas atrás:`);
    console.log(`   Relevância: log10(${example.likes} + 1) = ${score.relevanceScore.toFixed(4)}`);
    console.log(`   Frescor: e^(-0.693 * ${example.hours}/24) = ${score.freshnessScore.toFixed(4)}`);
    console.log(`   Score Final: ${score.relevanceScore.toFixed(4)} + ${score.freshnessScore.toFixed(4)} = ${score.finalScore.toFixed(4)}`);
  });
}

/**
 * Medir performance de execução
 */
function measureExecutionPerformance(posts: SamplePost[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('⚡ MEDIÇÃO DE PERFORMANCE DE EXECUÇÃO');
  console.log('='.repeat(120));
  
  const algorithms = Object.values(ScoringAlgorithm);
  const iterations = 1000;
  
  algorithms.forEach(algorithm => {
    const config: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      algorithm
    };
    
    const start = process.hrtime.bigint();
    
    for (let i = 0; i < iterations; i++) {
      posts.forEach(post => {
        ScoreCalculator.calculateScore(post.likeCount, post.createdAt, config);
      });
    }
    
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    const avgPerPost = duration / (iterations * posts.length);
    
    console.log(`\n${algorithm.toUpperCase()}:`);
    console.log(`  Total: ${duration.toFixed(2)}ms para ${iterations * posts.length} cálculos`);
    console.log(`  Média: ${avgPerPost.toFixed(4)}ms por cálculo`);
    console.log(`  Throughput: ${(1000 / avgPerPost).toFixed(0)} cálculos/segundo`);
  });
}

/**
 * Execução principal
 */
function main(): void {
  console.log('🚀 Iniciando Comparação de Algoritmos de Feed...\n');
  
  const posts = createSamplePosts();
  const results = posts.map(post => comparePostScores(post));
  
  // 1. Mostrar comparação detalhada para cada post
  displayResults(results);
  
  // 2. Analisar performance geral
  const analysis = analyzePerformance(results);
  
  // 3. Mostrar diferenças de ranking
  showRankingDifferences(results);
  
  // 4. Demonstrar fórmula recomendada
  demonstrateRecommendedFormula();
  
  // 5. Medir performance de execução
  measureExecutionPerformance(posts);
  
  // 6. Resumo e recomendações
  console.log('\n' + '='.repeat(120));
  console.log('💡 RESUMO & RECOMENDAÇÕES');
  console.log('='.repeat(120));
  console.log('\n🏆 Algoritmo BASE (RECOMENDADO):');
  console.log('   ✅ Previne posts virais de dominar completamente o feed');
  console.log('   ✅ Dá chances justas para posts novos com engajamento moderado');
  console.log('   ✅ Pontuação balanceada que funciona bem em diferentes cenários');
  console.log('   ✅ Desvio padrão mostra boa distribuição de scores');
  
  console.log('\n📈 Algoritmo TREND:');
  console.log('   ✅ Surface posts que estão crescendo rapidamente em engajamento');
  console.log('   ⚠️  Pode favor older posts with small bursts if not weighted properly');
  
  console.log('\n🎯 CONCLUSÃO:');
  console.log('   O algoritmo BASE fornece o melhor equilíbrio para a maioria das plataformas sociais.');
  console.log('   Use TREND para cenários específicos e testes A/B.');
  
  console.log('\n✨ Comparação completa! Use estes dados para suas decisões de load testing.\n');
}

// Executar a comparação se for chamado diretamente
if (require.main === module) {
  main();
}

export {
  createSamplePosts,
  comparePostScores,
  analyzePerformance,
  demonstrateRecommendedFormula
};