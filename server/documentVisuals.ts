import { createCanvas } from "@napi-rs/canvas";
import { unzipSync } from "fflate";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { storagePut } from "./storage";

type StoredVisual = { pageRef: string; storageKey: string; storageUrl: string };
const imageExtensions: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

const pageNumber = (value: string) => {
  const match = value.match(/(?:page|slide|section)\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
};

function resolveZipPath(baseDir: string, target: string) {
  const segments = `${baseDir}/${target}`.replace(/\\/g, "/").split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

async function renderPdfPages(buffer: Buffer, storageKey: string): Promise<StoredVisual[]> {
  const pdf = await getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
  const results: StoredVisual[] = [];
  const count = Math.min(pdf.numPages, 6);
  for (let pageIndex = 1; pageIndex <= count; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context as any, viewport, canvas: canvas as any }).promise;
    const stored = await storagePut(`${storageKey}/visuals/page-${pageIndex}.png`, canvas.toBuffer("image/png"), "image/png");
    results.push({ pageRef: `Page ${pageIndex}`, storageKey: stored.key, storageUrl: stored.url });
  }
  return results;
}

async function extractPptxImages(buffer: Buffer, storageKey: string): Promise<StoredVisual[]> {
  const archive = unzipSync(new Uint8Array(buffer));
  const results: StoredVisual[] = [];
  const storedPairs = new Set<string>();
  let assetIndex = 0;
  const slidePaths = Object.keys(archive).filter(path => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1]) - Number(b.match(/slide(\d+)/i)?.[1]));

  const storeMedia = async (mediaPath: string, pageRef: string) => {
    const bytes = archive[mediaPath];
    const extension = mediaPath.split(".").pop()?.toLowerCase() || "";
    const contentType = imageExtensions[extension];
    if (!bytes?.byteLength || !contentType) return;
    const pair = `${pageRef}:${mediaPath}`;
    if (storedPairs.has(pair)) return;
    storedPairs.add(pair);
    assetIndex += 1;
    const stored = await storagePut(`${storageKey}/visuals/${pageRef.toLowerCase().replace(/\s+/g, "-")}-${assetIndex}.${extension}`, Buffer.from(bytes), contentType);
    results.push({ pageRef, storageKey: stored.key, storageUrl: stored.url });
  };

  for (const slidePath of slidePaths) {
    const slideNumber = Number(slidePath.match(/slide(\d+)/i)?.[1] || 0);
    const slideXml = new TextDecoder().decode(archive[slidePath]);
    const relPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
    const relationships = new Map<string, string>();
    const relXml = archive[relPath] ? new TextDecoder().decode(archive[relPath]) : "";
    for (const match of Array.from(relXml.matchAll(/<Relationship\b[^>]*\/?>(?:<\/Relationship>)?/g))) {
      const tag = match[0];
      const id = tag.match(/\bId="([^"]+)"/)?.[1];
      const target = tag.match(/\bTarget="([^"]+)"/)?.[1];
      if (id && target) relationships.set(id, resolveZipPath("ppt/slides", target));
    }
    const visualRefs = Array.from(slideXml.matchAll(/\br:(?:embed|link)="([^"]+)"/g)).map(match => match[1]);
    for (const ref of visualRefs) {
      const mediaPath = relationships.get(ref);
      if (mediaPath) await storeMedia(mediaPath, `Slide ${slideNumber}`);
    }
  }

  for (const mediaPath of Object.keys(archive).filter(path => path.startsWith("ppt/media/"))) {
    if (!storedPairs.has(`Embedded visual:${mediaPath}`) && Array.from(storedPairs).every(pair => !pair.endsWith(`:${mediaPath}`))) await storeMedia(mediaPath, `Embedded visual ${assetIndex + 1}`);
  }
  return results;
}

export async function extractDocumentVisualAssets(input: { buffer: Buffer; mimeType: string; storageKey: string; references: Array<{ pageRef?: string; caption: string }> }) {
  let assets: StoredVisual[] = [];
  if (input.mimeType === "application/pdf") assets = await renderPdfPages(input.buffer, input.storageKey);
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") assets = await extractPptxImages(input.buffer, input.storageKey);
  if (!assets.length) return [];
  return assets.map(asset => {
    const reference = input.references.find(item => {
      const referencePage = pageNumber(item.pageRef || "");
      const assetPage = pageNumber(asset.pageRef);
      return referencePage !== undefined && assetPage !== undefined && referencePage === assetPage;
    });
    return { ...asset, caption: reference?.caption || `Extracted visual evidence from ${asset.pageRef}` };
  });
}
