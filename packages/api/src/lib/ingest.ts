import { v7 as uuidv7 } from "uuid";
import { db, asset, assetToTag, game, category, tag, eq, inArray } from "@skowt-monorepo/db";
import { badRequest } from "./errors";
import { writeFile, MAX_FILE_SIZE, MIME_TO_EXTENSION } from "./s3";
import { readImageDimensions, hasImageSignature } from "./image-dimensions";
import { generateThumbnail, thumbKey } from "./thumbnails";

/*
 * validate a set of tag ids for an upload: every id must exist, and the
 * mutually exclusive official/fanmade pair can't be combined. no-op for an
 * empty list. shared by the site's two-phase upload flow and server-side
 * ingest (Discord bot)
 */
export async function assertValidTagIds(tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  const existing = await db.query.tag.findMany({
    where: inArray(tag.id, tagIds),
    columns: { id: true, slug: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));
  if (tagIds.some((id) => !existingIds.has(id))) {
    badRequest("invalid tag ids");
  }
  const slugs = existing.map((t) => t.slug);
  if (slugs.includes("official") && slugs.includes("fanmade")) {
    badRequest("cannot use both 'official' and 'fanmade' tags");
  }
}

export interface IngestImageInput {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
  gameId: string;
  categoryId: string;
  tagIds?: string[];
  isSuggestive?: boolean;
  uploadedBy: string;
}

export type IngestResult = { ok: true; assetId: string } | { ok: false; reason: string };

/**
 * single-shot server-side ingest into the moderation queue: the trusted-bytes
 * sibling of the site's presign/commit flow (which exists because browsers
 * upload straight to R2). same invariants as commitUpload: magic-byte check,
 * fail-closed thumbnail, content sha256 in `hash`, dims in metadata, original
 * under limbo/{id}.{ext}. files are written before the row is inserted so a
 * storage failure can't strand a fileless pending row in the queue
 */
export async function ingestImageToQueue(input: IngestImageInput): Promise<IngestResult> {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 255) {
    return { ok: false, reason: "Name must be between 3 and 255 characters." };
  }

  const extension = MIME_TO_EXTENSION[input.mimeType];
  if (!extension) {
    return {
      ok: false,
      reason: `Unsupported file type. Allowed: ${Object.keys(MIME_TO_EXTENSION).join(", ")}`,
    };
  }

  if (input.bytes.byteLength > MAX_FILE_SIZE) {
    return {
      ok: false,
      reason: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  const gameExists = await db.query.game.findFirst({
    where: eq(game.id, input.gameId),
    columns: { id: true },
  });
  if (!gameExists) return { ok: false, reason: "Unknown game." };

  const categoryExists = await db.query.category.findFirst({
    where: eq(category.id, input.categoryId),
    columns: { id: true },
  });
  if (!categoryExists) return { ok: false, reason: "Unknown category." };

  const tagIds = input.tagIds ?? [];
  try {
    await assertValidTagIds(tagIds);
  } catch {
    return { ok: false, reason: "Invalid tag selection." };
  }

  if (!hasImageSignature(input.bytes)) {
    return { ok: false, reason: "File is not a valid image." };
  }

  let thumb: Uint8Array;
  try {
    thumb = await generateThumbnail(input.bytes);
  } catch {
    return { ok: false, reason: "Could not process the image." };
  }

  const dims = readImageDimensions(input.bytes);
  const contentHash = new Bun.CryptoHasher("sha256").update(input.bytes).digest("hex");
  const assetId = uuidv7();

  await writeFile(`limbo/${assetId}.${extension}`, input.bytes, input.mimeType);
  await writeFile(thumbKey(assetId), thumb, "image/webp");

  await db.insert(asset).values({
    id: assetId,
    name,
    gameId: input.gameId,
    categoryId: input.categoryId,
    uploadedBy: input.uploadedBy,
    status: "pending",
    hash: contentHash,
    size: input.bytes.byteLength,
    extension,
    isSuggestive: input.isSuggestive ?? false,
    ...(dims ? { metadata: { image: dims } } : {}),
  });

  if (tagIds.length > 0) {
    await db.insert(assetToTag).values(tagIds.map((tagId) => ({ assetId, tagId })));
  }

  return { ok: true, assetId };
}
