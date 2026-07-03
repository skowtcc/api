const CORS_PROXY = "https://bridge.skowt.cc/?url=";
const ASSET_BASE = "https://pack.skowt.cc/asset";

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function canShareFiles(): boolean {
  if (!navigator.share || !navigator.canShare) return false;
  const testFile = new File(["test"], "test.png", { type: "image/png" });
  return navigator.canShare({ files: [testFile] });
}

// fetches via CORS proxy then triggers native share sheet (ios: includes "save image")
export async function shareAssetFile(
  assetId: string,
  assetName: string,
  extension: string,
): Promise<void> {
  const rawUrl = `${ASSET_BASE}/${assetId}.${extension}`;
  const proxyUrl = `${CORS_PROXY}${encodeURIComponent(rawUrl)}`;

  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error(`Failed to fetch asset: ${response.status}`);

  const blob = await response.blob();
  const mimeType = MIME_MAP[extension.toLowerCase()] || "application/octet-stream";
  const file = new File([blob], `${assetName}.${extension}`, { type: mimeType });

  await navigator.share({ files: [file], title: assetName });
}
