import { mock } from "bun:test";
import type { Session } from "@skowt-monorepo/auth";
import { v7 as uuidv7 } from "uuid";

process.env.NODE_ENV = "test";
if (!process.env.DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = "file:api-test.db";
}

interface BatchAsset {
  id: string;
  name: string;
  extension: string;
  gameName: string;
  categoryName: string;
}

interface BatchData {
  assets: BatchAsset[];
  timestamp: number;
}

const mockBatchStore = new Map<string, BatchData>();
const mockUserBatches = new Map<string, Map<string, number>>();

const MAX_PAYLOAD_512KB = 512 * 1024;

function getOrCreateUserBatchMap(userId: string): Map<string, number> {
  const existing = mockUserBatches.get(userId);
  if (existing) {
    return existing;
  }

  const next = new Map<string, number>();
  mockUserBatches.set(userId, next);
  return next;
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Batch payload exceeds maximum size limit");
    this.name = "PayloadTooLargeError";
  }
}

export const mockS3 = {
  maxFileSize: 50 * 1024 * 1024,
  fileExists: async (_s3Key: string): Promise<boolean> => true,
  getFileSize: async (_s3Key: string): Promise<number | null> => 1024,
  readFileBytes: async (_s3Key: string, _start: number, _end: number): Promise<Uint8Array | null> =>
    null,
  readFileFull: async (_s3Key: string): Promise<Uint8Array | null> => null,
  writeFile: async (_s3Key: string, _bytes: Uint8Array, _contentType: string): Promise<void> => {},
  deleteFile: async (_s3Key: string): Promise<void> => {},
  moveFile: async (_fromKey: string, _toKey: string): Promise<boolean> => true,
  generatePresignedUploadUrl: (
    assetId: string,
    extension: string,
    skipQueue: boolean = false,
  ): { uploadUrl: string; s3Key: string; expiresIn: number } => {
    const folder = skipQueue ? "asset" : "limbo";
    return {
      uploadUrl: `https://mock-s3.local/${folder}/${assetId}.${extension}?signature=mock`,
      s3Key: `${folder}/${assetId}.${extension}`,
      expiresIn: 300,
    };
  },
};

export const mockDiscord = {
  inServer: true,
};

export function resetTestServiceMocks(): void {
  mockBatchStore.clear();
  mockUserBatches.clear();

  mockS3.fileExists = async () => true;
  mockS3.getFileSize = async () => 1024;
  mockS3.readFileBytes = async () => null;
  mockS3.readFileFull = async () => null;
  mockS3.writeFile = async () => {};
  mockS3.deleteFile = async () => {};
  mockS3.moveFile = async () => true;

  mockDiscord.inServer = true;
}

const MIME_TO_EXTENSION = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

mock.module("../lib/s3", () => ({
  ALLOWED_EXTENSIONS: ["png", "jpg", "jpeg", "webp", "gif"] as const,
  MAX_FILE_SIZE: mockS3.maxFileSize,
  MIME_TO_EXTENSION,
  generatePresignedUploadUrl: (assetId: string, extension: string, skipQueue: boolean = false) =>
    mockS3.generatePresignedUploadUrl(assetId, extension, skipQueue),
  fileExists: (s3Key: string) => mockS3.fileExists(s3Key),
  getFileSize: (s3Key: string) => mockS3.getFileSize(s3Key),
  readFileBytes: (s3Key: string, start: number, end: number) =>
    mockS3.readFileBytes(s3Key, start, end),
  readFileFull: (s3Key: string) => mockS3.readFileFull(s3Key),
  writeFile: (s3Key: string, bytes: Uint8Array, contentType: string) =>
    mockS3.writeFile(s3Key, bytes, contentType),
  deleteFile: (s3Key: string) => mockS3.deleteFile(s3Key),
  moveFile: (fromKey: string, toKey: string) => mockS3.moveFile(fromKey, toKey),
}));

mock.module("../lib/discord-server", () => ({
  checkDiscordServerMembership: async (_userId: string): Promise<boolean> => mockDiscord.inServer,
  invalidateServerMembershipCache: async (_userId: string): Promise<void> => {},
}));

const mockRedisClient = {
  get: async (_key: string): Promise<string | null> => null,
  setex: async (_key: string, _ttl: number, _value: string): Promise<"OK"> => "OK",
  scan: async (_cursor: string, ..._args: Array<string | number>): Promise<[string, string[]]> => [
    "0",
    [],
  ],
  del: async (..._keys: string[]): Promise<number> => 0,
  ping: async (): Promise<"PONG"> => "PONG",
  quit: async (): Promise<"OK"> => "OK",
  disconnect: (): void => {},
};

async function recordDownloadBatch(userId: string, assets: BatchAsset[]): Promise<string | null> {
  if (assets.length === 0) {
    return null;
  }

  const payload = JSON.stringify({ assets });
  if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_512KB) {
    throw new PayloadTooLargeError();
  }

  const batchId = uuidv7();
  const timestamp = Date.now();

  const userBatches = getOrCreateUserBatchMap(userId);
  userBatches.set(batchId, timestamp);
  mockBatchStore.set(batchId, { assets, timestamp });

  if (userBatches.size > 50) {
    const sorted = Array.from(userBatches.entries()).sort((a, b) => a[1] - b[1]);
    const overflow = userBatches.size - 50;
    for (let i = 0; i < overflow; i++) {
      const oldest = sorted[i];
      if (!oldest) {
        continue;
      }

      userBatches.delete(oldest[0]);
      mockBatchStore.delete(oldest[0]);
    }
  }

  return batchId;
}

async function getDownloadBatches(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<Array<{ batchId: string; timestamp: number; assetCount: number; gameNames: string[] }>> {
  const userBatches = mockUserBatches.get(userId);
  if (!userBatches || userBatches.size === 0) {
    return [];
  }

  return Array.from(userBatches.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(offset, offset + limit)
    .map(([batchId, timestamp]) => {
      const data = mockBatchStore.get(batchId);
      const gameNames = data ? [...new Set(data.assets.map((asset) => asset.gameName))] : [];
      return {
        batchId,
        timestamp,
        assetCount: data?.assets.length ?? 0,
        gameNames,
      };
    });
}

async function getDownloadBatch(userId: string, batchId: string): Promise<BatchAsset[] | null> {
  const userBatches = mockUserBatches.get(userId);
  if (!userBatches?.has(batchId)) {
    return null;
  }

  return mockBatchStore.get(batchId)?.assets ?? null;
}

async function deleteDownloadBatch(userId: string, batchId: string): Promise<boolean> {
  const userBatches = mockUserBatches.get(userId);
  if (!userBatches?.has(batchId)) {
    return false;
  }

  userBatches.delete(batchId);
  mockBatchStore.delete(batchId);

  return true;
}

async function getBatchCount(userId: string): Promise<number> {
  return mockUserBatches.get(userId)?.size ?? 0;
}

async function clearAllBatches(userId: string): Promise<boolean> {
  const userBatches = mockUserBatches.get(userId);
  if (!userBatches) {
    return true;
  }

  for (const batchId of userBatches.keys()) {
    mockBatchStore.delete(batchId);
  }

  mockUserBatches.delete(userId);
  return true;
}

mock.module("../lib/redis", () => ({
  PayloadTooLargeError,
  getRedis: async () => mockRedisClient,
  closeRedis: async (): Promise<void> => {},
  isRedisHealthy: async (): Promise<boolean> => true,
  recordDownloadBatch,
  getDownloadBatches,
  getDownloadBatch,
  deleteDownloadBatch,
  getBatchCount,
  clearAllBatches,
}));

const { appRouter } = await import("../routers/index");

type TestCallerContext = {
  session: Session | null;
  headers?: Headers;
};

export function createTestCaller(
  context: TestCallerContext,
): ReturnType<typeof appRouter.createCaller> {
  return appRouter.createCaller({
    session: context.session,
    headers: context.headers ?? new Headers(),
    set: { headers: {} } as never,
  });
}
