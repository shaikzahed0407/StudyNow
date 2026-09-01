import { ENV } from "../_core/env";
import { storagePut } from "../storage";
import type { DocumentProcessingResult } from "./documentProcessor";

type JavaExtractedPage = { pageRef: string; order: number; text: string };
type JavaExtractedImage = { pageRef: string; fileName: string; contentType: string; base64Data: string };
type JavaExtractionResponse = { fileName: string; documentType: string; pages: JavaExtractedPage[]; images: JavaExtractedImage[] };

const JAVA_DOC_SERVICE_TIMEOUT_MS = 20_000;

function keywordsFor(text: string) {
  return text.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 24).join(",");
}

/**
 * Calls the Spring Boot doc-service (Apache PDFBox/POI) to extract text and
 * images from a PDF or PPTX without spending an LLM call on raw parsing.
 *
 * Returns `null` (rather than throwing) whenever the service isn't
 * configured or isn't reachable, so callers can transparently fall back to
 * the existing LLM-based extraction path — the Java service is an
 * optimization, not a hard dependency, for anyone who hasn't started it.
 */
export async function tryJavaExtraction(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  storageKey: string;
}): Promise<DocumentProcessingResult | null> {
  if (!ENV.javaDocServiceUrl) return null;

  const endpoint = input.mimeType === "application/pdf" ? "extract/pdf"
    : input.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ? "extract/pptx"
    : null;
  if (!endpoint) return null;

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(input.buffer)], { type: input.mimeType }), input.fileName);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JAVA_DOC_SERVICE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${ENV.javaDocServiceUrl.replace(/\/+$/, "")}/api/${endpoint}`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.warn(`[JavaDocService] extraction failed (${response.status}) for ${input.fileName}; falling back to LLM extraction`);
      return null;
    }

    const result = (await response.json()) as JavaExtractionResponse;

    const chunks = (result.pages || [])
      .filter(page => page.text?.trim())
      .map((page, index) => ({
        content: page.text.trim(),
        pageRef: page.pageRef || `Section ${index + 1}`,
        keywords: keywordsFor(page.text),
        chunkOrder: index,
      }));

    // Upload each extracted/rendered image to storage ourselves — the Java
    // service is stateless and never talks to Supabase directly.
    const visuals = [];
    for (const image of result.images || []) {
      const bytes = Buffer.from(image.base64Data, "base64");
      const stored = await storagePut(
        `${input.storageKey}/visuals/${image.fileName}`,
        bytes,
        image.contentType || "image/png",
      );
      visuals.push({
        pageRef: image.pageRef,
        caption: `Visual evidence from ${image.pageRef}`,
        asset: { storageKey: stored.key, storageUrl: stored.url },
      });
    }

    return { chunks, visuals };
  } catch (error) {
    console.warn(`[JavaDocService] unreachable or errored for ${input.fileName}, falling back to LLM extraction:`, error instanceof Error ? error.message : error);
    return null;
  }
}
