import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/*
 * read NODE_ENV before schema construction to enable environment-conditional
 * strictness. this is the one place in the codebase that reads process.env
 * directly for NODE_ENV
 */
const nodeEnv = (process.env.NODE_ENV ?? "development") as "production" | "development" | "test";
const isProd = nodeEnv === "production";
const isTestEnv = nodeEnv === "test";

/*
 * schema helpers: tighten validation in production, relax in dev/test.
 * the resulting typescript types include `| undefined` for conditional fields,
 * which forces consumers to handle the optional case. the runtime validation
 * ensures the value actually exists in production
 */
function requiredInProd(base = z.string().min(1)) {
  return isProd ? base : base.optional();
}
function requiredUnlessTest(base = z.string().min(1)) {
  return isTestEnv ? base.optional() : base;
}

// validated env singleton

let _env: ServerEnv | null = null;

function createServerEnv() {
  const env = createEnv({
    server: {
      NODE_ENV: z.enum(["production", "development", "test"]).default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(13387),

      /*
       * bind host. localhost-only in dev/test so the API is never reachable on
       * an untrusted LAN; 0.0.0.0 in prod where it runs behind a proxy
       */
      HOST: z.string().default(isProd ? "0.0.0.0" : "127.0.0.1"),

      // database
      DATABASE_URL: z.string().min(1),
      DATABASE_AUTH_TOKEN: requiredInProd(),

      // auth
      BETTER_AUTH_SECRET: isProd ? z.string().min(32) : z.string().min(1),
      BETTER_AUTH_URL: requiredInProd(z.string().url()),

      // CORS
      CORS_ORIGIN: requiredInProd(),

      // Discord OAuth
      DISCORD_CLIENT_ID: requiredInProd(),
      DISCORD_CLIENT_SECRET: requiredInProd(),

      // discord-lookup API (optional; defaults to the hosted antifield/discord-lookup worker)
      DISCORD_LOOKUP_URL: z.string().url().optional(),

      /*
       * Discord bot interactions endpoint (optional; absent = bot routes off).
       * ed25519 public key from the bot application's dev-portal page
       */
      DISCORD_BOT_PUBLIC_KEY: z.string().optional(),

      // Redis
      REDIS_URL: z.string().min(1).default("redis://localhost:6383"),

      // Cloudflare
      REQUIRE_CLOUDFLARE: z.enum(["true", "false"]).default("false"),

      // S3 storage
      S3_ACCESS_KEY_ID: requiredUnlessTest(),
      S3_SECRET_ACCESS_KEY: requiredUnlessTest(),
      S3_ENDPOINT: requiredUnlessTest(isProd ? z.string().url() : z.string().min(1)),
      S3_BUCKET: requiredUnlessTest(),
      S3_CDN_URL: requiredInProd(z.string().url()),

      // Better Stack telemetry: two sources

      /*
       * a spike (scripts/spike/spike-observability.ts) confirmed BS treats
       * logs sources (JS/Node.js platform) and OTel sources
       * (OpenTelemetry platform) as distinct: tokens aren't interchangeable,
       * and OTLP wire format renders log events nested under `message.*` while
       * the BS native adapter renders them as top-level columns (clean
       * queries). to get both clean log queries and OTel-standard trace
       * ingestion, we run one source of each type
       */

      /*
       * all 4 vars are required-in-prod. tokens wrapped at consumer boundary
       * via Redacted. endpoints are per-source URLs visible in BS UI; they
       * aren't secrets but they are source-specific (the legacy
       * in.logs.betterstack.com generic endpoint returns 401 against the
       * current BS UI sources)
       */
      BETTERSTACK_LOGS_TOKEN: requiredInProd(),
      BETTERSTACK_LOGS_ENDPOINT: requiredInProd(z.string().url()),
      BETTERSTACK_OTEL_TOKEN: requiredInProd(),
      BETTERSTACK_OTEL_ENDPOINT: requiredInProd(z.string().url()),

      /*
       * hmac key for IP hashing in /__telemetry events. declared now so the env
       * schema is stable; not read yet (the browser telemetry sink is future work)
       */
      IP_HASH_HMAC_KEY: requiredInProd(),
    },
    runtimeEnv: process.env,
    isServer: true,
    emptyStringAsUndefined: true,
  });

  // Discord credentials must be provided as a pair
  const hasId = Boolean(env.DISCORD_CLIENT_ID?.trim());
  const hasSecret = Boolean(env.DISCORD_CLIENT_SECRET?.trim());
  if (hasId !== hasSecret) {
    throw new Error("DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set together.");
  }

  return env;
}

export type ServerEnv = ReturnType<typeof createServerEnv>;

// validates on first call, caches thereafter
export function getServerEnv(): ServerEnv {
  if (!_env) {
    _env = createServerEnv();
  }
  return _env;
}

// derived helpers

export function isProduction(): boolean {
  return getServerEnv().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getServerEnv().NODE_ENV === "development";
}

export function isTest(): boolean {
  return getServerEnv().NODE_ENV === "test";
}

export function shouldRequireCloudflare(): boolean {
  return getServerEnv().REQUIRE_CLOUDFLARE === "true";
}

/*
 * Discord OAuth is a paired capability (see the set-together refinement in
 * createServerEnv). false = degraded dev mode: sign-in is disabled and the
 * server-membership gate defaults open. requiredInProd on both vars guarantees
 * this can never be false in production
 */
export function isDiscordConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}
