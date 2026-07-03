import type Redis from "ioredis";
import { v7 as uuidv7 } from "uuid";
import { getServerEnv } from "@skowt-monorepo/env/server";
import { patchIORedisPrototype } from "@skowt-monorepo/observability/server";

const MAX_BATCHES = 50;
const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;
const MAX_PAYLOAD_512KB = 512 * 1024;

let clientPromise: Promise<Redis> | null = null;

/*
 * ioredis is loaded lazily via dynamic import + immediately patched at the
 * prototype level before any instance is constructed. the official OTel
 * @opentelemetry/instrumentation-ioredis relies on require/import-in-the-middle
 * hooks that Bun's runtime doesn't reliably fire, so empirically zero Redis
 * spans land in Better Stack with that approach. patching the prototype
 * ourselves (same internal method the official instrumentation patches:
 * sendCommand) is deterministic and Bun-native. the type-only import above
 * keeps the file typed without triggering a runtime load
 */
export async function getRedis(): Promise<Redis> {
  if (!clientPromise) {
    clientPromise = import("ioredis").then(({ default: Redis }) => {
      patchIORedisPrototype(Redis);
      return new Redis(getServerEnv().REDIS_URL);
    });
  }
  return clientPromise;
}

export async function closeRedis(): Promise<void> {
  if (!clientPromise) {
    return;
  }

  const redis = await clientPromise;
  clientPromise = null;

  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}

export async function isRedisHealthy(): Promise<boolean> {
  try {
    const redis = await getRedis();
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export interface BatchAsset {
  id: string;
  name: string;
  extension: string;
  gameName: string;
  categoryName: string;
}

interface BatchData {
  assets: BatchAsset[];
}

function userBatchesKey(userId: string): string {
  return `downloads:user:${userId}:batches`;
}

function batchDataKey(batchId: string): string {
  return `downloads:batch:${batchId}`;
}

export class PayloadTooLargeError extends Error {
  constructor() {
    super("Batch payload exceeds maximum size limit");
    this.name = "PayloadTooLargeError";
  }
}

export async function recordDownloadBatch(
  userId: string,
  assets: BatchAsset[],
): Promise<string | null> {
  if (assets.length === 0) return null;

  const batchId = uuidv7();
  const now = Date.now();
  const batchData: BatchData = { assets };
  const payload = JSON.stringify(batchData);

  if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_512KB) {
    throw new PayloadTooLargeError();
  }

  try {
    const redis = await getRedis();
    const userKey = userBatchesKey(userId);
    const dataKey = batchDataKey(batchId);

    const pipeline = redis.pipeline();
    pipeline.set(dataKey, payload, "EX", NINETY_DAYS_IN_SECONDS);
    pipeline.zadd(userKey, now, batchId);
    pipeline.expire(userKey, NINETY_DAYS_IN_SECONDS);
    await pipeline.exec();

    const count = await redis.zcard(userKey);
    if (count > MAX_BATCHES) {
      const trimCount = count - MAX_BATCHES;
      const oldBatches = await redis.zrange(userKey, 0, trimCount - 1);

      if (oldBatches.length > 0) {
        const deletePipeline = redis.pipeline();
        for (const oldBatchId of oldBatches) {
          deletePipeline.del(batchDataKey(oldBatchId));
        }
        deletePipeline.zremrangebyrank(userKey, 0, trimCount - 1);
        await deletePipeline.exec();
      }
    }

    return batchId;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) throw error;
    console.error("[Redis] recordDownloadBatch failed:", error);
    return null;
  }
}

export interface DownloadBatchSummary {
  batchId: string;
  timestamp: number;
  assetCount: number;
  gameNames: string[];
}

export async function getDownloadBatches(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<DownloadBatchSummary[]> {
  try {
    const redis = await getRedis();
    const userKey = userBatchesKey(userId);

    const results = await redis.zrevrange(userKey, offset, offset + limit - 1, "WITHSCORES");

    if (results.length === 0) return [];

    const batchMeta: { batchId: string; timestamp: number }[] = [];
    const batchKeys: string[] = [];

    for (let i = 0; i + 1 < results.length; i += 2) {
      const batchId = results[i]!;
      const timestamp = parseInt(results[i + 1]!, 10);
      batchMeta.push({ batchId, timestamp });
      batchKeys.push(batchDataKey(batchId));
    }

    const payloads = await redis.mget(...batchKeys);

    const batches: DownloadBatchSummary[] = [];
    const corruptBatchIds: string[] = [];

    for (let i = 0; i < batchMeta.length; i++) {
      const { batchId, timestamp } = batchMeta[i]!;
      const dataStr = payloads[i];

      if (!dataStr) {
        corruptBatchIds.push(batchId);
        continue;
      }

      try {
        const data = JSON.parse(dataStr) as BatchData;
        const gameNames = [...new Set(data.assets.map((a) => a.gameName))];
        batches.push({
          batchId,
          timestamp,
          assetCount: data.assets.length,
          gameNames,
        });
      } catch {
        corruptBatchIds.push(batchId);
      }
    }

    if (corruptBatchIds.length > 0) {
      await redis.zrem(userKey, ...corruptBatchIds);
    }

    return batches;
  } catch (error) {
    console.error("[Redis] getDownloadBatches failed:", error);
    return [];
  }
}

export async function getDownloadBatch(
  userId: string,
  batchId: string,
): Promise<BatchAsset[] | null> {
  try {
    const redis = await getRedis();
    const userKey = userBatchesKey(userId);

    const score = await redis.zscore(userKey, batchId);
    if (score === null) return null;

    const dataStr = await redis.get(batchDataKey(batchId));
    if (!dataStr) return null;

    try {
      const data = JSON.parse(dataStr) as BatchData;
      return data.assets;
    } catch {
      await redis.zrem(userKey, batchId);
      return null;
    }
  } catch (error) {
    console.error("[Redis] getDownloadBatch failed:", error);
    return null;
  }
}

export async function deleteDownloadBatch(userId: string, batchId: string): Promise<boolean> {
  try {
    const redis = await getRedis();
    const userKey = userBatchesKey(userId);

    const score = await redis.zscore(userKey, batchId);
    if (score === null) return false;

    const pipeline = redis.pipeline();
    pipeline.zrem(userKey, batchId);
    pipeline.del(batchDataKey(batchId));
    await pipeline.exec();

    return true;
  } catch (error) {
    console.error("[Redis] deleteDownloadBatch failed:", error);
    return false;
  }
}

export async function getBatchCount(userId: string): Promise<number> {
  try {
    const redis = await getRedis();
    return await redis.zcard(userBatchesKey(userId));
  } catch (error) {
    console.error("[Redis] getBatchCount failed:", error);
    return 0;
  }
}

export async function clearAllBatches(userId: string): Promise<boolean> {
  try {
    const redis = await getRedis();
    const userKey = userBatchesKey(userId);

    const allBatches = await redis.zrange(userKey, 0, -1);
    if (allBatches.length > 0) {
      const pipeline = redis.pipeline();
      for (const batchId of allBatches) {
        pipeline.del(batchDataKey(batchId));
      }
      pipeline.del(userKey);
      await pipeline.exec();
    } else {
      await redis.del(userKey);
    }

    return true;
  } catch (error) {
    console.error("[Redis] clearAllBatches failed:", error);
    return false;
  }
}
