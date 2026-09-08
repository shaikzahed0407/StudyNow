import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { ENV } from "./_core/env";

let _supabaseClient: ReturnType<typeof createClient> | null = null;
const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), ".storage");

function ensureLocalStorageDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

function getSupabase() {
  if (
    !_supabaseClient &&
    ENV.supabaseUrl &&
    (ENV.supabaseServiceRoleKey || ENV.supabaseAnonKey)
  ) {
    _supabaseClient = createClient(
      ENV.supabaseUrl,
      ENV.supabaseServiceRoleKey || ENV.supabaseAnonKey,
      {
        auth: { persistSession: false },
      },
    );
  }
  return _supabaseClient;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const supabase = getSupabase();
  const buffer = Buffer.isBuffer(data)
    ? data
    : typeof data === "string"
      ? Buffer.from(data)
      : Buffer.from(data as Uint8Array);

  // 1. Primary: Supabase Storage
  if (supabase) {
    const { error } = await supabase.storage
      .from(ENV.supabaseStorageBucket)
      .upload(key, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[Storage] Supabase upload failed: ${error.message}, falling back to local storage`);
    } else {
      const {
        data: { publicUrl },
      } = supabase.storage.from(ENV.supabaseStorageBucket).getPublicUrl(key);
      return { key, url: publicUrl };
    }
  }

  // 2. Local File System Fallback (Works offline & during local development)
  try {
    ensureLocalStorageDir();
    const filePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, "_"));
    fs.writeFileSync(filePath, buffer);
    return { key, url: `/storage/${key.replace(/\//g, "_")}` };
  } catch (err) {
    console.error("[Storage] Local write failed:", err);
    return { key, url: `/storage/${key}` };
  }
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const supabase = getSupabase();
  if (supabase) {
    const {
      data: { publicUrl },
    } = supabase.storage.from(ENV.supabaseStorageBucket).getPublicUrl(key);
    return { key, url: publicUrl };
  }
  return { key, url: `/storage/${key.replace(/\//g, "_")}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const supabase = getSupabase();

  if (supabase) {
    const { data, error } = await supabase.storage
      .from(ENV.supabaseStorageBucket)
      .createSignedUrl(key, 3600);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from(ENV.supabaseStorageBucket).getPublicUrl(key);
    return publicUrl;
  }

  return `/storage/${key.replace(/\//g, "_")}`;
}

export async function storageDownload(
  relKey: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const key = normalizeKey(relKey);
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(ENV.supabaseStorageBucket)
        .download(key);

      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer();
        return {
          data: Buffer.from(arrayBuffer),
          contentType: data.type || "application/octet-stream",
        };
      }
    } catch (err) {
      console.warn(`[Storage] Supabase download error for ${key}:`, err);
    }
  }

  // Fallback to local filesystem
  try {
    const filePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, "_"));
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath);
      return { data, contentType: "application/octet-stream" };
    }
  } catch (err) {
    console.error(`[Storage] Local read error for ${key}:`, err);
  }

  return null;
}
