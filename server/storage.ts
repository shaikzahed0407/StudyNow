import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

let _supabaseClient: ReturnType<typeof createClient> | null = null;

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

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) return null;
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
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

  // 1. Primary: Supabase Storage
  if (supabase) {
    const buffer = Buffer.isBuffer(data)
      ? data
      : typeof data === "string"
        ? Buffer.from(data)
        : Buffer.from(data as Uint8Array);

    const { error } = await supabase.storage
      .from(ENV.supabaseStorageBucket)
      .upload(key, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`[Storage] Supabase upload failed: ${error.message}`);
    } else {
      const {
        data: { publicUrl },
      } = supabase.storage.from(ENV.supabaseStorageBucket).getPublicUrl(key);
      return { key, url: publicUrl };
    }
  }

  // 2. Secondary: Forge Storage
  const forge = getForgeConfig();
  if (forge) {
    const presignUrl = new URL("v1/storage/presign/put", forge.forgeUrl + "/");
    presignUrl.searchParams.set("path", key);

    const presignResp = await fetch(presignUrl, {
      headers: { Authorization: `Bearer ${forge.forgeKey}` },
    });

    if (presignResp.ok) {
      const { url: s3Url } = (await presignResp.json()) as { url: string };
      if (s3Url) {
        const blob =
          typeof data === "string"
            ? new Blob([data], { type: contentType })
            : new Blob([data as any], { type: contentType });

        const uploadResp = await fetch(s3Url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });

        if (uploadResp.ok) {
          return { key, url: `/manus-storage/${key}` };
        }
      }
    }
  }

  // 3. Fallback for local mock/dev
  return { key, url: `/storage/${key}` };
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
  return { key, url: `/storage/${key}` };
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

  const forge = getForgeConfig();
  if (forge) {
    const getUrl = new URL("v1/storage/presign/get", forge.forgeUrl + "/");
    getUrl.searchParams.set("path", key);

    const resp = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${forge.forgeKey}` },
    });

    if (resp.ok) {
      const { url } = (await resp.json()) as { url: string };
      if (url) return url;
    }
  }

  return `/storage/${key}`;
}
