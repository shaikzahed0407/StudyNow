import { describe, expect, it } from "vitest";
import { extractDocumentVisualAssets } from "./documentVisuals";

describe("document visual extraction", () => {
  it("does not create assets for plain text sources", async () => {
    await expect(extractDocumentVisualAssets({ buffer: Buffer.from("plain note"), mimeType: "text/plain", storageKey: "notes/example.txt", references: [] })).resolves.toEqual([]);
  });
});
