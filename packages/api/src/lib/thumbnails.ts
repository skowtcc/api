import sharp from "sharp";

/* must match the offline backfill pipeline that generated the catalog's
   existing thumbs (300px-wide webp @ q70 - the params the old Cloudflare
   resize used), so new uploads are indistinguishable from backfilled assets */
const THUMB_WIDTH = 300;
const THUMB_QUALITY = 70;

export function thumbKey(assetId: string): string {
  return `asset/${assetId}-thumb.webp`;
}

/**
 * generate the card thumbnail for an uploaded image. sharp decodes with
 * shrink-on-load (it never holds the full-resolution raster for a downscale),
 * so multi-MB originals stay cheap, and it strips all metadata (EXIF/XMP)
 * from the output by default. throws on undecodable input - commitUpload
 * treats that as a rejected upload, because the web unconditionally requests
 * {id}-thumb.webp for cards: an asset without a thumb would render broken
 */
export async function generateThumbnail(bytes: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(bytes, { failOn: "none" })
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toBuffer();
  return new Uint8Array(out);
}
