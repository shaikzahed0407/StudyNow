export type ExtractedDocumentChunk = {
  content: string;
  pageRef?: string;
  keywords?: string;
  chunkOrder: number;
};

export type ExtractedDocumentVisual = {
  pageRef?: string;
  caption: string;
  asset?: { storageKey: string; storageUrl: string };
};

export type DocumentProcessingResult = {
  chunks: ExtractedDocumentChunk[];
  visuals?: ExtractedDocumentVisual[];
  visualCaption?: string;
};

/**
 * Integration seam for future high-volume or institution-hosted processing.
 * The current implementation lives in routers.ts and uses the built-in server-side
 * multimodal model. A Java/Spring Boot worker can implement this contract later
 * behind a private service boundary without changing the UI or database vocabulary.
 */
export interface DocumentProcessor {
  extract(input: { fileName: string; mimeType: string; sourceUrl: string }): Promise<DocumentProcessingResult>;
}

export const documentProcessorProvider = "built-in-multimodal-llm" as const;
