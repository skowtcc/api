import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import Redis from "ioredis";
import { db } from "@skowt-monorepo/db";
import * as schema from "@skowt-monorepo/db/schema/auth";
import { getServerEnv } from "@skowt-monorepo/env/server";
import { Redacted } from "@skowt-monorepo/observability/core";
import { patchIORedisPrototype } from "@skowt-monorepo/observability/server";

const env = getServerEnv();

/* patch Redis.prototype.sendCommand before constructing any Redis instance so the secondary-storage client below emits OTel spans from its very first command. idempotent via a Symbol marker, so calling this in addition to the patch path in packages/api/src/lib/redis.ts is safe */
patchIORedisPrototype(Redis);

/* dedicated Redis connection for Better Auth's secondary storage. separate from the application Redis client in packages/api/lib/redis.ts so the auth session cache traffic stays on its own connection pool (Better Auth issues frequent GET/SETEX/DEL per request; isolating them avoids head-of-line blocking against application Redis commands like rate-limit EVAL) */
const authRedis = new Redis(env.REDIS_URL);

/* Better Auth's SecondaryStorage adapter for ioredis. storing session + user data here turns the per-request `db findOne session` + `db findOne user` round-trips (each ~57ms against Turso) into a single sub-ms Redis GET. Better Auth handles cache invalidation automatically on signOut and session revoke, so a TTL-only strategy isn't needed */
/* ioredis uses `redis.set(key, value, "EX", seconds)` for TTL, not the node-redis `{ EX: seconds }` options object; important to get right - failing to honor TTL would silently leak session data after expiry */
const authSecondaryStorage = {
  async get(key: string) {
    return authRedis.get(key);
  },
  async set(key: string, value: string, ttl?: number) {
    if (ttl) {
      await authRedis.set(key, value, "EX", ttl);
    } else {
      await authRedis.set(key, value);
    }
  },
  async delete(key: string) {
    await authRedis.del(key);
  },
};

const trustedOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : [];

/* wrap secrets at the env read site (consumer-boundary pattern); better-auth expects raw strings at construction, we unwrap exactly once below */
const discordClientSecret = env.DISCORD_CLIENT_SECRET
  ? Redacted.make(env.DISCORD_CLIENT_SECRET)
  : undefined;

const socialProviders =
  env.DISCORD_CLIENT_ID && discordClientSecret
    ? {
        discord: {
          clientId: env.DISCORD_CLIENT_ID,
          clientSecret: Redacted.value(discordClientSecret),
          overrideUserInfoOnSignIn: true,
          mapProfileToUser: async (profile: { username: string; global_name?: string | null }) => ({
            name: profile.username,
            displayName: profile.global_name || profile.username,
          }),
        },
      }
    : {};

const advancedConfig =
  env.NODE_ENV === "production"
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: "skowt.cc",
        },
        defaultCookieAttributes: {
          sameSite: "none" as const,
          secure: true,
          httpOnly: true,
        },
      }
    : {
        defaultCookieAttributes: {
          sameSite: "lax" as const,
          secure: false,
          httpOnly: true,
        },
      };

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: schema,
  }),
  // see the authSecondaryStorage definition above for the why + TTL gotcha
  secondaryStorage: authSecondaryStorage,
  /* rate limiting is left at better-auth's default (prod-only, in-memory, with sensible per-endpoint limits). we deliberately do NOT set `rateLimit.storage: "secondary-storage"`: older better-auth wrote those keys without a TTL, so they accumulate in Redis (issue #4472). the primary, cross-instance gate for /api/auth/* is our own Redis sliding-window limiter applied at the Elysia route (apps/server), which shares one trust model with the tRPC surface (packages/api/src/lib/rate-limit.ts) */
  trustedOrigins,
  disabledPaths: ["/update-user", "/change-password", "/delete-user"],
  emailAndPassword: {
    enabled: false,
  },
  socialProviders,
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "user",
        input: false,
      },
      displayName: {
        type: "string",
        required: false,
      },
      profileUpdatedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
    changeEmail: {
      enabled: false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, profileUpdatedAt: new Date() },
        }),
      },
      update: {
        before: async (user) => {
          if (
            user.image !== undefined ||
            user.name !== undefined ||
            user.displayName !== undefined
          ) {
            return {
              data: { ...user, profileUpdatedAt: new Date() },
            };
          }
          return { data: user };
        },
      },
    },
  },
  session: {
    cookieCache: {
      enabled: false,
    },
  },
  plugins: [],
  advanced: {
    ...advancedConfig,
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
