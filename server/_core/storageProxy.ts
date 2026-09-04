import type { Express } from "express";
import express from "express";
import fs from "fs";
import path from "path";

export function registerStorageProxy(app: Express) {
  const localStorageDir = path.resolve(process.cwd(), ".storage");
  if (!fs.existsSync(localStorageDir)) {
    fs.mkdirSync(localStorageDir, { recursive: true });
  }

  // Serve locally uploaded files
  app.use("/storage", express.static(localStorageDir));
}
