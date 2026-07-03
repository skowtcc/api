import JSZip from "jszip";
import { format } from "date-fns";
import type { SelectedAsset } from "@/stores/selection-store";

const CORS_PROXY = "https://bridge.skowt.cc/?url=";
const ASSET_BASE = "https://pack.skowt.cc/asset";

function buildRawAssetUrl(assetId: string, extension: string): string {
  return `${ASSET_BASE}/${assetId}.${extension}`;
}

/*
 * downloads assets as a zip organised into {game}/{category}/{name}.{ext}
 * returns only the assets that actually made it into the archive, so the caller
 * records a download for what was delivered, not for everything selected
 */
export async function downloadAssetsAsZip(
  assets: SelectedAsset[],
  onProgress?: (progress: number) => void,
): Promise<SelectedAsset[]> {
  if (assets.length === 0) {
    throw new Error("No assets to download");
  }

  const zip = new JSZip();
  const total = assets.length;
  const succeeded: SelectedAsset[] = [];
  let completed = 0;

  for (const asset of assets) {
    try {
      const rawUrl = buildRawAssetUrl(asset.id, asset.extension || "png");
      const proxyUrl = CORS_PROXY + encodeURIComponent(rawUrl);

      const response = await fetch(proxyUrl);

      if (response.ok) {
        const blob = await response.blob();

        const gameName = sanitizeFileName(asset.gameName);
        const categoryName = sanitizeFileName(asset.categoryName);
        const fileName = sanitizeFileName(asset.name);
        const extension = asset.extension || "png";

        const path = `${gameName}/${categoryName}/${fileName}.${extension}`;

        zip.file(path, blob);
        succeeded.push(asset);
      }
    } catch (err) {
      console.warn(`[ZIP] Failed to fetch asset ${asset.id}:`, err);
    }

    completed++;
    if (onProgress) {
      onProgress((completed / total) * 100);
    }
  }

  if (succeeded.length === 0) {
    throw new Error("Failed to download any assets");
  }

  const content = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = `skowt-assets-${format(new Date(), "yyyy-MM-dd")}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return succeeded;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}
