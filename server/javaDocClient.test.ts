import { afterEach, describe, expect, it, vi } from "vitest";
import { tryJavaExtraction } from "./services/javaDocClient";

describe("tryJavaExtraction", () => {
  const originalEnv = process.env.JAVA_DOC_SERVICE_URL;

  afterEach(() => {
    process.env.JAVA_DOC_SERVICE_URL = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns null (not throws) when the service is not configured", async () => {
    delete process.env.JAVA_DOC_SERVICE_URL;
    const result = await tryJavaExtraction({
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("irrelevant"),
      storageKey: "users/1/notes/notes.pdf",
    });
    expect(result).toBeNull();
  });

  it("returns null for mime types the Java service doesn't handle (e.g. images)", async () => {
    process.env.JAVA_DOC_SERVICE_URL = "http://localhost:8080";
    const result = await tryJavaExtraction({
      fileName: "diagram.png",
      mimeType: "image/png",
      buffer: Buffer.from("irrelevant"),
      storageKey: "users/1/notes/diagram.png",
    });
    expect(result).toBeNull();
  });

  it("returns null instead of throwing when the service is unreachable", async () => {
    process.env.JAVA_DOC_SERVICE_URL = "http://localhost:8080";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await tryJavaExtraction({
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("irrelevant"),
      storageKey: "users/1/notes/notes.pdf",
    });
    expect(result).toBeNull();
  });

  it("returns null when the service responds with a non-2xx status", async () => {
    process.env.JAVA_DOC_SERVICE_URL = "http://localhost:8080";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 422 })));
    const result = await tryJavaExtraction({
      fileName: "notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("irrelevant"),
      storageKey: "users/1/notes/notes.pdf",
    });
    expect(result).toBeNull();
  });
});
