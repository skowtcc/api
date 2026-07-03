import { z } from "zod";
import type { AssetMetadata } from "@skowt-monorepo/db";

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
});

// shape expected by formatAssetResponse - any row with game/category/assetToTags relations
export type AssetRow = {
  id: string;
  name: string;
  hash: string;
  extension: string;
  size: number;
  downloadCount: number;
  viewCount: number;
  isSuggestive: boolean;
  metadata: AssetMetadata | null;
  createdAt: Date;
  game: { id: string; slug: string; name: string };
  category: { id: string; slug: string; name: string };
  assetToTags: Array<{ tag: { id: string; slug: string; name: string } }>;
};

export function formatAssetResponse(a: AssetRow) {
  return {
    id: a.id,
    name: a.name,
    hash: a.hash,
    extension: a.extension,
    size: a.size,
    isSuggestive: a.isSuggestive,
    metadata: a.metadata,
    createdAt: a.createdAt,
    game: { id: a.game.id, slug: a.game.slug, name: a.game.name },
    category: { id: a.category.id, slug: a.category.slug, name: a.category.name },
    tags: a.assetToTags.map((att) => ({ id: att.tag.id, slug: att.tag.slug, name: att.tag.name })),
  };
}
