import { generateEmbedding } from "./embeddings";
import { getChunksWithoutEmbeddings, updateChunkEmbedding } from "../db";

export interface BackfillResult {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Backfills embeddings for active chunks that are missing them.
 *
 * - Processes in batches to respect API rate limits
 * - Individual failures do not stop the batch
 * - Never overwrites valid existing embeddings
 * - Restartable: only picks up chunks where embedding IS NULL
 */
export async function backfillMissingEmbeddings(
  batchSize = 50,
): Promise<BackfillResult> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // Process in batches until no more chunks are missing embeddings
  while (true) {
    const chunks = await getChunksWithoutEmbeddings(batchSize);
    if (!chunks.length) break;

    for (const chunk of chunks) {
      processed++;
      try {
        const embedding = await generateEmbedding(chunk.content);
        if (embedding) {
          await updateChunkEmbedding(chunk.id, embedding);
          succeeded++;
        } else {
          failed++;
        }
      } catch (err) {
        console.warn(`[Backfill] Failed to embed chunk ${chunk.id}:`, err);
        failed++;
      }
    }

    // Rate-limit pause between batches
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { processed, succeeded, failed };
}
