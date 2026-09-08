import { generateEmbedding } from "./embeddings";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A chunk record from the database (as returned by getAuthorizedChunks). */
export interface AuthorizedChunk {
  id: number;
  noteId: number;
  pageRef: string | null;
  content: string;
  keywords: string | null;
  chunkOrder: number;
  isActive: number;
  embedding: number[] | null;
  createdAt: Date;
}

/** A chunk annotated with retrieval scores. */
export interface RankedChunk extends AuthorizedChunk {
  keywordScore: number;
  semanticScore: number;
  hybridScore: number;
  relevanceScore: number; // Alias for hybridScore, kept for backward compat with existing code
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HybridRetrievalConfig {
  /** Weight for semantic similarity (0–1). Default 0.7 */
  semanticWeight: number;
  /** Weight for keyword relevance (0–1). Default 0.3 */
  keywordWeight: number;
  /** Maximum candidates before final selection / reranking. Default 20 */
  candidateLimit: number;
  /** Maximum chunks to pass to Gemini. Default 8 */
  finalLimit: number;
  /** Minimum hybrid score to consider a chunk relevant. Default 0.15 */
  minRelevanceThreshold: number;
}

const DEFAULT_CONFIG: HybridRetrievalConfig = {
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  candidateLimit: 20,
  finalLimit: 8,
  minRelevanceThreshold: 0.15,
};

// ---------------------------------------------------------------------------
// Keyword scoring — enhanced version of the original rankChunks()
// ---------------------------------------------------------------------------

/** Stopwords to skip during keyword scoring. */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "it",
  "its", "this", "that", "these", "those", "what", "which", "who",
  "whom", "i", "me", "my", "we", "our", "you", "your", "he", "him",
  "his", "she", "her", "they", "them", "their",
]);

function extractTerms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 2 && !STOPWORDS.has(term));
}

function computeKeywordScore(chunk: AuthorizedChunk, queryTerms: string[]): number {
  if (!queryTerms.length) return 0;
  const haystack = `${chunk.content} ${chunk.keywords || ""}`.toLowerCase();
  let matchCount = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) matchCount++;
  }
  return matchCount / queryTerms.length; // Normalized to [0, 1]
}

// ---------------------------------------------------------------------------
// Semantic scoring — cosine similarity computed in-process
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ---------------------------------------------------------------------------
// Hybrid retrieval
// ---------------------------------------------------------------------------

/**
 * Core hybrid retrieval function.
 *
 * Takes a pre-authorized set of chunks (from getAuthorizedChunks) and
 * combines keyword + semantic scoring to produce ranked candidates.
 *
 * Security: This function NEVER queries the database for chunks.
 * It only operates on the already-authorized set provided by the caller.
 */
export async function hybridRetrieveChunks(
  authorizedChunks: AuthorizedChunk[],
  question: string,
  overrides?: Partial<HybridRetrievalConfig>,
): Promise<RankedChunk[]> {
  const config = { ...DEFAULT_CONFIG, ...overrides };

  if (!authorizedChunks.length || !question.trim()) return [];

  // 1. Keyword scoring
  const queryTerms = extractTerms(question);

  // 2. Semantic scoring — generate query embedding
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await generateEmbedding(question);
  } catch (err) {
    console.warn("[HybridRetrieval] Query embedding failed, using keyword-only:", err);
  }

  // Determine effective weights. When semantic scoring is unavailable
  // (no API key, embedding failure), use keyword-only mode with full weight.
  const semanticAvailable = queryEmbedding !== null;
  const effectiveSemanticWeight = semanticAvailable ? config.semanticWeight : 0;
  const effectiveKeywordWeight = semanticAvailable ? config.keywordWeight : 1;

  // 3. Score each authorized chunk
  const scored: RankedChunk[] = authorizedChunks.map((chunk) => {
    const keywordScore = computeKeywordScore(chunk, queryTerms);

    let semanticScore = 0;
    if (queryEmbedding && chunk.embedding) {
      const rawSimilarity = cosineSimilarity(queryEmbedding, chunk.embedding);
      // Cosine similarity for normalized embeddings is in [-1, 1].
      // Map to [0, 1] for combination. Values below 0 indicate irrelevance.
      semanticScore = Math.max(0, rawSimilarity);
    }

    const hybridScore =
      effectiveSemanticWeight * semanticScore +
      effectiveKeywordWeight * keywordScore;

    return {
      ...chunk,
      keywordScore,
      semanticScore,
      hybridScore,
      relevanceScore: hybridScore,
    };
  });

  // 4. Filter by minimum threshold and sort by hybrid score
  const candidates = scored
    .filter((chunk) => chunk.hybridScore >= config.minRelevanceThreshold)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, config.candidateLimit);

  // 5. Optional reranking
  if (ENV.enableReranking && candidates.length > config.finalLimit) {
    try {
      const reranked = await rerankChunks(question, candidates, config.finalLimit);
      return reranked;
    } catch (err) {
      console.warn("[HybridRetrieval] Reranking failed, using hybrid scores:", err);
    }
  }

  // 6. Return top finalLimit chunks
  return candidates.slice(0, config.finalLimit);
}

// ---------------------------------------------------------------------------
// Reranking — optional Gemini-based relevance scoring
// ---------------------------------------------------------------------------

/**
 * Reranks candidate chunks by asking Gemini to score each (question, chunk) pair.
 * Falls back to the input order if the LLM call fails.
 *
 * This layer is modular — a dedicated reranking model (e.g. Cohere Rerank)
 * can be swapped in here without changing the rest of the pipeline.
 */
export async function rerankChunks(
  question: string,
  candidates: RankedChunk[],
  limit: number,
): Promise<RankedChunk[]> {
  // Build compact summaries for each candidate
  const summaries = candidates.map((chunk, i) => ({
    index: i,
    preview: chunk.content.slice(0, 300),
  }));

  try {
    const response = await invokeLLM({
      model: ENV.geminiModel,
      messages: [
        {
          role: "system",
          content:
            "You are a relevance scoring assistant. Given a question and a list of document chunks, score each chunk's relevance to the question on a scale of 0–10. Return ONLY a JSON array of objects with {index, score}. Do not add any explanation.",
        },
        {
          role: "user",
          content: `Question: ${question}\n\nChunks:\n${summaries.map((s) => `[${s.index}] ${s.preview}`).join("\n\n")}`,
        },
      ],
      response_format: { type: "json_object" },
      maxTokens: 1024,
    });

    const raw = response.choices[0]?.message?.content;
    if (typeof raw !== "string") return candidates.slice(0, limit);

    const parsed = JSON.parse(raw);
    const scores: Array<{ index: number; score: number }> = Array.isArray(parsed)
      ? parsed
      : parsed.scores || parsed.rankings || parsed.results || [];

    if (!scores.length) return candidates.slice(0, limit);

    // Apply reranking scores
    const reranked = candidates.map((chunk, i) => {
      const entry = scores.find((s) => s.index === i);
      const rerankScore = entry ? entry.score / 10 : 0;
      return {
        ...chunk,
        hybridScore: rerankScore,
        relevanceScore: rerankScore,
      };
    });

    return reranked
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit);
  } catch (err) {
    console.warn("[Reranking] LLM reranking failed, falling back to hybrid scores:", err);
    return candidates.slice(0, limit);
  }
}
