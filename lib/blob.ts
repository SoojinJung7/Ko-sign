import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { put } from "@vercel/blob";

import { env, isBlobConfigured } from "@/lib/env";

/**
 * PDF storage abstraction.
 *
 * - When Vercel Blob is configured (`BLOB_READ_WRITE_TOKEN` present) we upload
 *   to Blob and persist the returned public URL as the `fileKey`.
 * - Otherwise we fall back to local disk under `.blob-store/` so the entire
 *   flow is testable in dev with zero external credentials. The persisted
 *   `fileKey` is then the relative object key.
 *
 * `getPdfBytes` transparently resolves either shape: absolute URLs are fetched,
 * everything else is read from the local store.
 */

const LOCAL_STORE = path.join(process.cwd(), ".blob-store");

function isUrl(key: string): boolean {
  return key.startsWith("http://") || key.startsWith("https://");
}

async function toBuffer(data: Buffer | Blob): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Store a PDF under `key`. Returns the value to persist as the document's
 * `fileKey` (a Blob URL in prod, or the local object key in dev).
 */
export async function putPdf(key: string, data: Buffer | Blob): Promise<string> {
  const buffer = await toBuffer(data);

  if (isBlobConfigured) {
    const result = await put(key, buffer, {
      access: "public",
      token: env.BLOB_READ_WRITE_TOKEN,
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return result.url;
  }

  const target = path.join(LOCAL_STORE, key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return key;
}

/** Read the stored PDF bytes for a persisted `fileKey` (URL or local key). */
export async function getPdfBytes(fileKey: string): Promise<Uint8Array> {
  if (isUrl(fileKey)) {
    const res = await fetch(fileKey);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch blob (${res.status} ${res.statusText}) for key ${fileKey}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  const target = path.join(LOCAL_STORE, fileKey);
  const buffer = await readFile(target);
  return new Uint8Array(buffer);
}
