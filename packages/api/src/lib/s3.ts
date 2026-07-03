import { S3Client } from "bun";
import { getServerEnv } from "@skowt-monorepo/env/server";
import { Redacted } from "@skowt-monorepo/observability/core";
import { wrapInSpan } from "@skowt-monorepo/observability/server";

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const env = getServerEnv();

    /* wrap secrets at env read so the existence check below uses local
       Redacted vars, not raw env.X references (which would trip the CI grep guard) */
    const accessKeyId = env.S3_ACCESS_KEY_ID ? Redacted.make(env.S3_ACCESS_KEY_ID) : undefined;
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY
      ? Redacted.make(env.S3_SECRET_ACCESS_KEY)
      : undefined;

    if (!accessKeyId || !secretAccessKey || !env.S3_ENDPOINT || !env.S3_BUCKET) {
      throw new Error(
        "S3 configuration is incomplete. Set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, and S3_BUCKET.",
      );
    }

    _s3Client = new S3Client({
      accessKeyId: Redacted.value(accessKeyId),
      secretAccessKey: Redacted.value(secretAccessKey),
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: "auto",
    });
  }
  return _s3Client;
}

export const ALLOWED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const MIME_TO_EXTENSION: Record<string, AllowedExtension> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

interface PresignedUploadResult {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

const EXTENSION_TO_MIME: Record<AllowedExtension, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function generatePresignedUploadUrl(
  assetId: string,
  extension: AllowedExtension,
  skipQueue: boolean = false,
): PresignedUploadResult {
  const folder = skipQueue ? "asset" : "limbo";
  const s3Key = `${folder}/${assetId}.${extension}`;
  const s3File = getS3Client().file(s3Key);
  const mimeType = EXTENSION_TO_MIME[extension];

  const uploadUrl = s3File.presign({
    expiresIn: 300,
    method: "PUT",
    type: mimeType,
  });

  return {
    uploadUrl,
    s3Key,
    expiresIn: 300,
  };
}

export async function moveFile(fromKey: string, toKey: string): Promise<boolean> {
  /* named operation. the S3 PUT (destFile.write) is the slow remote call worth
     tracing. wrap the whole move (existence checks + write + delete) so the
     span reflects the user-visible duration of the move */
  return wrapInSpan("s3_upload_put", async () => {
    const client = getS3Client();
    const sourceFile = client.file(fromKey);
    const destFile = client.file(toKey);

    const sourceExists = await sourceFile.exists();
    if (!sourceExists) {
      return false;
    }

    // pass s3file directly. avoids loading entire file into memory
    await destFile.write(sourceFile);

    const destExists = await destFile.exists();
    if (!destExists) {
      return false;
    }

    await sourceFile.delete();
    return true;
  });
}

export async function fileExists(s3Key: string): Promise<boolean> {
  try {
    const file = getS3Client().file(s3Key);
    return await file.exists();
  } catch {
    return false;
  }
}

/**
 * object size in bytes via a stat (HEAD), without downloading the body. lets
 * commitUpload bound an object before readFileFull pulls it into memory -
 * nothing else pins the real size, since a presigned PUT ignores the
 * client-declared value. returns null on any failure
 */
export async function getFileSize(s3Key: string): Promise<number | null> {
  try {
    const { size } = await getS3Client().file(s3Key).stat();
    return size;
  } catch {
    return null;
  }
}

/**
 * read a byte range of an object (a single ranged GET, not a full download).
 * used to pull just the image header for dimension detection. returns null on
 * any failure - callers treat the bytes as best-effort
 */
export async function readFileBytes(
  s3Key: string,
  start: number,
  end: number,
): Promise<Uint8Array | null> {
  try {
    const buf = await getS3Client().file(s3Key).slice(start, end).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export async function deleteFile(s3Key: string): Promise<void> {
  const file = getS3Client().file(s3Key);
  await file.delete();
}

/**
 * read an entire object into memory. used by commitUpload to hash + thumbnail
 * the uploaded image. callers must bound the object with getFileSize first (the
 * presigned PUT accepts any byte count regardless of the client-declared size);
 * an unbounded read here is a heap-exhaustion vector. returns null on failure
 */
export async function readFileFull(s3Key: string): Promise<Uint8Array | null> {
  try {
    const buf = await getS3Client().file(s3Key).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** write bytes to an object key (used for generated thumbnails) */
export async function writeFile(
  s3Key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await getS3Client().file(s3Key).write(bytes, { type: contentType });
}
