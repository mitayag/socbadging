import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";

const root = process.env.MEDIA_ROOT ?? join(process.cwd(), "storage");
export async function putBadgeImage(buffer: Buffer, extension: string) {
  const key = `badges/${randomUUID()}.${extension}`;
  const path = join(root, key); await mkdir(dirname(path), { recursive: true }); await writeFile(path, buffer); return key;
}
export async function readStoredFile(key: string) {
  const safe = normalize(key).replace(/^([.][.][/\\])+/, "");
  if (safe !== key || key.startsWith("/") || !key.startsWith("badges/")) throw new Error("Invalid storage key");
  return readFile(join(root, safe));
}
