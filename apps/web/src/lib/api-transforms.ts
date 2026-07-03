import type { Asset } from "@/types/assets";
import type { AssetDetail, AssetRelatedItem } from "@/types/trpc";

const ASSET_BASE = (import.meta.env.VITE_ASSET_URL as string) || "https://pack.skowt.cc";

/* card/grid image: the pre-generated 300px webp thumb that sits next to every
   original in R2 ({id}-thumb.webp, built by the offline pipeline). replaces the
   Cloudflare cdn-cgi resize - plain objects, free egress, identical in dev.
   local dev (localstack) has no thumbs, so it serves the raw original instead */
export function buildAssetUrl(id: string, extension: string): string {
  if (ASSET_BASE.includes("localhost")) {
    return `${ASSET_BASE}/asset/${id}.${extension}`;
  }
  return `${ASSET_BASE}/asset/${id}-thumb.webp`;
}

export function buildRawAssetUrl(id: string, extension: string): string {
  return `${ASSET_BASE}/asset/${id}.${extension}`;
}

/* queued uploads live under limbo/ until moderation approves them; the mod
   queue and the uploader's own history render them from there */
export function buildLimboAssetUrl(id: string, extension: string): string {
  return `${ASSET_BASE}/limbo/${id}.${extension}`;
}

/* always-prod thumb url for a known asset id. for fixed illustrations (e.g.
   empty-state art) that live only on the prod CDN, so it must skip
   buildAssetUrl's localhost branch */
export function cdnAssetUrl(id: string): string {
  return `https://pack.skowt.cc/asset/${id}-thumb.webp`;
}

/* pre-generated 64px webp icon thumbs (~1-2KB each; the raw icon pngs run up
   to ~900KB for a 16px render). always prod: dev seeds reference prod games
   and localstack has no game/ folder. new games need an icon thumb generated
   alongside the icon (see the game-icons pass, 2026-07-02) */
export function gameIconUrl(slug: string): string {
  return `https://pack.skowt.cc/game/${slug}-icon-thumb.webp`;
}

/* full-size cover art (game/{slug}-cover.png, ~1156x675) - hero banner
   backdrops only, never grids: these are ~1MB pngs. always prod, same
   reasoning as the icons above. COVER_VERSION busts the Cloudflare edge
   cache - bump it whenever cover files are replaced in the bucket */
const COVER_VERSION = 3;

export function gameCoverUrl(slug: string): string {
  return `https://pack.skowt.cc/game/${slug}-cover.png?v=${COVER_VERSION}`;
}

/* post-transform uploader shape. tRPC returns the uploader as { id, name,
   image, role }; this domain shape uses username/avatar to match the rest of
   the component layer */
export interface Uploader {
  id: string;
  username: string;
  avatar: string | null;
  role: string;
}

/* the fields shared by every asset shape (card, related, detail): identity,
   denormalized game/category, the thumbnail url, and extension. the detail and
   related transforms layer their extra fields on top of this */
function toAssetCore(a: {
  id: string;
  name: string;
  extension: string;
  game: { id: string; slug: string; name: string };
  category: { id: string; slug: string; name: string };
}): Pick<
  Asset,
  | "id"
  | "name"
  | "gameId"
  | "gameName"
  | "gameSlug"
  | "categoryId"
  | "categoryName"
  | "categorySlug"
  | "url"
  | "extension"
> {
  return {
    id: a.id,
    name: a.name,
    gameId: a.game.id,
    gameName: a.game.name,
    gameSlug: a.game.slug,
    categoryId: a.category.id,
    categoryName: a.category.name,
    categorySlug: a.category.slug,
    url: buildAssetUrl(a.id, a.extension),
    extension: a.extension,
  };
}

export type GameAttribution = {
  publisher: string | null;
  usageTerms: string | null;
  termsUrl: string | null;
};

export function transformAssetDetail(
  apiAsset: AssetDetail,
): Asset & { uploader: Uploader | null; size: number | null; attribution: GameAttribution } {
  return {
    ...toAssetCore(apiAsset),
    attribution: {
      publisher: apiAsset.game.publisher,
      usageTerms: apiAsset.game.usageTerms,
      termsUrl: apiAsset.game.termsUrl,
    },
    tags: apiAsset.tags.map((t) => t.name),
    size: apiAsset.size,
    dimensions: apiAsset.metadata?.image,
    isSuggestive: apiAsset.isSuggestive,
    /* tRPC types createdAt as Date (inferred from Drizzle's timestamp column)
       but JSON-over-the-wire delivers it as a string. defensive against both */
    uploadDate:
      typeof apiAsset.createdAt === "string"
        ? apiAsset.createdAt
        : new Date(apiAsset.createdAt).toISOString(),
    uploader: apiAsset.uploader
      ? {
          id: apiAsset.uploader.id,
          username: apiAsset.uploader.name ?? "Unknown",
          avatar: apiAsset.uploader.image,
          role: apiAsset.uploader.role,
        }
      : null,
  };
}

export function transformRelatedAssets(apiAssets: AssetRelatedItem[]): Asset[] {
  return apiAssets.map((a) => ({
    ...toAssetCore(a),
    tags: [],
    dimensions: a.metadata?.image,
  }));
}
