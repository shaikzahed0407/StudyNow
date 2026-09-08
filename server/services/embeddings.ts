import { GoogleGenAI } from "@google/genai";
import { ENV } from "../_core/env";

const EMBEDDING_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 100;
// Approximate token limit per input — truncate to stay safe
const MAX_INPUT_CHARS = 8000;

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_ai) {
    if (!ENV.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is required for embedding generation");
    }
    _ai = new GoogleGenAI({ apiKey: ENV.geminiApiKey });
  }
  return _ai;
}

function truncateText(text: string): string {
  if (text.length <= MAX_INPUT_CHARS) return text;
  return text.slice(0, MAX_INPUT_CHARS);
}

/**
 * Generate a single embedding vector for the given text.
 * Returns null if the API call fails — callers should handle gracefully.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;

  try {
    const ai = getAI();
    const response = await ai.models.embedContent({
      model: ENV.embeddingModel,
      contents: truncateText(text.trim()),
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) {
      console.warn(
        `[Embeddings] Unexpected embedding dimension: expected ${EMBEDDING_DIMENSIONS}, got ${values?.length ?? 0}`,
      );
      return null;
    }

    return values;
  } catch (error) {
    console.warn("[Embeddings] Failed to generate embedding:", error);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batches.
 * Returns an array of the same length as the input — each entry is either
 * a float[] embedding or null if that particular text failed.
 * Embedding failures never throw — they return null for the failed items.
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<(number[] | null)[]> {
  if (!texts.length) return [];

  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let batchStart = 0; batchStart < texts.length; batchStart += MAX_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + MAX_BATCH_SIZE, texts.length);
    const batch = texts.slice(batchStart, batchEnd);

    // Generate embeddings individually within each batch to isolate failures.
    // The Gemini embedding API aggregates multiple contents into one result
    // when passed as a list, so we call per-text for reliable 1:1 mapping.
    const batchPromises = batch.map(async (text, i) => {
      const embedding = await generateEmbedding(text);
      results[batchStart + i] = embedding;
    });

    await Promise.all(batchPromises);

    // Brief pause between batches to respect rate limits
    if (batchEnd < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
