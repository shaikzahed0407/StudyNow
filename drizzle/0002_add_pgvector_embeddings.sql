CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "noteChunks" ADD COLUMN IF NOT EXISTS "embedding" vector(768);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "noteChunks_embedding_idx" ON "noteChunks"
  USING hnsw ("embedding" vector_cosine_ops);

