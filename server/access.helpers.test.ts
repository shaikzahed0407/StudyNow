import { describe, expect, it } from "vitest";
import { getAuthorizedChunks, getPublishedResource } from "./db";
import { sourceReferenceMatches } from "./routers";

describe("StudyNow access helpers", () => {
  it("denies resource previews when the student has no assigned published row", async () => {
    await expect(getPublishedResource(999999, 999999)).resolves.toBeNull();
  });

  it("does not expose Q&A chunks when authorized note lookup returns no rows", async () => {
    await expect(getAuthorizedChunks(999999, 999999)).resolves.toEqual([]);
  });

  it("matches visuals to the same page or slide reference", () => {
    expect(sourceReferenceMatches("Page 4", "Page 4")).toBe(true);
    expect(sourceReferenceMatches("Section 4", "Page 4")).toBe(true);
    expect(sourceReferenceMatches("Slide 2", "Slide 3")).toBe(false);
    expect(sourceReferenceMatches("Page 2", "Embedded visual 1")).toBe(false);
  });
});
