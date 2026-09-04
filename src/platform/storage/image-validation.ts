import sharp from "sharp";

const MAX_BYTES = 2 * 1024 * 1024;
const allowed = new Set(["png", "jpeg", "webp"]);

export async function validateBadgeImage(buffer: Buffer, _filename: string) {
  void _filename;
  if (buffer.byteLength > MAX_BYTES) throw new Error("Badge artwork must not exceed 2 MiB");
  const metadata = await sharp(buffer).metadata().catch(() => null);
  if (!metadata?.format || !allowed.has(metadata.format) || !metadata.width || !metadata.height)
    throw new Error("Badge artwork must be a valid PNG, JPEG, or WebP image");
  if (metadata.width < 128 || metadata.height < 128 || metadata.width > 4096 || metadata.height > 4096)
    throw new Error("Badge artwork dimensions must be between 128 and 4096 pixels");
  return { format: metadata.format, width: metadata.width, height: metadata.height, extension: metadata.format === "jpeg" ? "jpg" : metadata.format };
}
