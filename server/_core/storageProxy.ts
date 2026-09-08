import type { Express, Request, Response } from "express";
import express from "express";
import fs from "fs";
import path from "path";
import { sdk } from "./sdk";
import * as db from "../db";
import { storageDownload } from "../storage";

export function registerStorageProxy(app: Express) {
  const localStorageDir = path.resolve(process.cwd(), ".storage");
  if (!fs.existsSync(localStorageDir)) {
    fs.mkdirSync(localStorageDir, { recursive: true });
  }

  // Serve locally uploaded files
  app.use("/storage", express.static(localStorageDir));

  // Inline Note File Streaming Proxy (prevents cross-origin PDF/image iframe blocking)
  app.get("/api/notes/:noteId/file", async (req: Request, res: Response) => {
    try {
      let user: any = null;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
        if (queryToken) {
          try {
            const session = await sdk.verifySession(queryToken);
            if (session) {
              user = await db.getUserByOpenId(session.openId);
            }
          } catch {}
        }
      }

      const noteId = parseInt(req.params.noteId, 10);
      if (isNaN(noteId) || noteId <= 0) {
        return res.status(400).send("Invalid note ID");
      }

      const noteDetails = await db.getNoteWithFiles(noteId, user?.id, user?.role);
      if (!noteDetails) {
        return res.status(404).send("Note not found or access denied");
      }

      if (!noteDetails.files || noteDetails.files.length === 0) {
        return res.status(404).send("No file attached to this note");
      }

      const fileIdParam = typeof req.query.fileId === "string" ? parseInt(req.query.fileId, 10) : undefined;
      let targetFile = noteDetails.files[0];
      if (fileIdParam) {
        const matched = noteDetails.files.find((f: any) => f.id === fileIdParam);
        if (matched) targetFile = matched;
      }

      const downloaded = await storageDownload(targetFile.storageKey);
      if (downloaded) {
        res.setHeader("Content-Type", targetFile.mimeType || downloaded.contentType || "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(targetFile.originalName || "document")}"`,
        );
        res.setHeader("Cache-Control", "private, max-age=3600");
        return res.send(downloaded.data);
      }

      if (targetFile.storageUrl) {
        return res.redirect(targetFile.storageUrl);
      }

      return res.status(404).send("File content not available");
    } catch (err) {
      console.error("[StorageProxy] File streaming error:", err);
      return res.status(500).send("Internal server error");
    }
  });
}
