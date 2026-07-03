import "dotenv/config";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { createContext } from "@skowt-monorepo/api/context";
import { appRouter } from "@skowt-monorepo/api/routers/index";
import { getServerEnv, isDiscordConfigured } from "@skowt-monorepo/env/server";
import { discordInteractions } from "./discord/interactions";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { auth } from "@skowt-monorepo/auth";
import { closeRedis, isRedisHealthy } from "@skowt-monorepo/api/lib/redis";
import { rateLimitByIp, RATE_LIMITS } from "@skowt-monorepo/api/lib/rate-limit";
import { isDbHealthy, ensureAssetFts } from "@skowt-monorepo/db";
import {
  createLogger,
  initObservability,
  loggerPlugin,
  createOtelPlugin,
  getCurrentSpan,
  initFetchTracing,
  reportError,
  shutdownOtel,
  Redacted,
} from "@skowt-monorepo/observability/server";

const DEFAULT_CORS_ORIGINS = ["https://skowt.cc", "https://dev.skowt.cc"];

const env = getServerEnv();

/*
 * initialize observability before constructing the logger - BS uses two
 * separate sources (logs + OTel) with distinct tokens and distinct
 * per-source endpoints. tokens are wrapped via the consumer-boundary
 * pattern; unwrap exactly once at each handoff
 */
const logsToken = env.BETTERSTACK_LOGS_TOKEN
  ? Redacted.make(env.BETTERSTACK_LOGS_TOKEN)
  : undefined;
const otelToken = env.BETTERSTACK_OTEL_TOKEN
  ? Redacted.make(env.BETTERSTACK_OTEL_TOKEN)
  : undefined;

initObservability({
  service: "skowt-server",
  environment: env.NODE_ENV,
  betterStackToken: logsToken ? Redacted.value(logsToken) : undefined,
  betterStackEndpoint: env.BETTERSTACK_LOGS_ENDPOINT,
});

/*
 * OTel trace plugin - returns undefined when token or endpoint is absent; the
 * caller skips mounting in that case (dev / local runs without BS configured)
 */
const otelPlugin = createOtelPlugin({
  serviceName: "skowt-server",
  otelToken: otelToken ? Redacted.value(otelToken) : undefined,
  otelEndpoint: env.BETTERSTACK_OTEL_ENDPOINT,
});

/*
 * patch globalThis.fetch only when OTel is actually shipping traces somewhere.
 * the patched fetch would produce no-op spans without an exporter, but
 * skipping the patch in dev keeps call stacks identical to upstream and avoids
 * surprising any in-process middleware that introspects fetch's prototype
 */
if (otelPlugin) initFetchTracing();

const log = createLogger("server");

/*
 * boot-time visibility into telemetry mode. three states matter to the
 * operator: full BS wiring, logs-only (no OTel), and stdout-only fallback.
 * in dev these env vars are optional, so the typical local run prints the
 * stdout-only banner. no degradation, just clarity that BS isn't configured
 */
const bsLogsConfigured = Boolean(logsToken && env.BETTERSTACK_LOGS_ENDPOINT);
const bsOtelConfigured = Boolean(otelPlugin); // returns undefined unless both token + endpoint are set
log.info("Telemetry mode", {
  logs: bsLogsConfigured
    ? "stdout + Better Stack (native adapter)"
    : "stdout only; Better Stack not configured",
  traces: bsOtelConfigured
    ? "OTLP to Better Stack"
    : "disabled; Better Stack OTel source not configured",
  environment: env.NODE_ENV,
});

/*
 * same operator-clarity treatment for the Discord integration: without OAuth
 * creds (dev only - requiredInProd guards prod) sign-in is disabled and the
 * membership gate defaults open. the NOT CONFIGURED string doubles as a
 * Better Stack keyword tripwire if it ever appears outside local dev
 */
log.info("Discord integration", {
  oauth: isDiscordConfigured()
    ? "configured"
    : "NOT CONFIGURED - sign-in disabled, membership gate defaults open (dev only)",
  bot: env.DISCORD_BOT_PUBLIC_KEY
    ? "interactions endpoint active"
    : "off (no DISCORD_BOT_PUBLIC_KEY)",
});

const corsOrigins = env.CORS_ORIGIN
  ? env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : DEFAULT_CORS_ORIGINS;

let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;

/*
 * self-provision the FTS5 asset-name search index before serving. drizzle-kit
 * can't model FTS5 virtual tables/triggers, so the Railway pre-deploy migrate
 * step alone doesn't guarantee the index exists - the server ensures its own
 * search schema here as belt-and-braces: idempotent, cheap in steady state
 * (a count check gates the one-time backfill), and awaited so search works from
 * the first request. a failure is logged but never crashes boot -- the query
 * layer falls back to LIKE for <3-char terms and a missing index would surface as
 * a normal query error rather than a dead server
 */
try {
  const { backfilled } = await ensureAssetFts();
  log.info("Asset search index ready", { backfilled });
} catch (error) {
  log.error("Failed to provision asset search index (asset_fts); search may degrade", { error });
}

/*
 * plugin mount order is load-bearing for trace_id correlation:
 *   1. cors(): request-shape normalization
 *   2. opentelemetry(): establishes the OTel span context in AsyncLocalStorage
 *      so the evlog loggerPlugin's per-request child logger picks up trace_id
 *   3. loggerPlugin(): reads the active span via AsyncLocalStorage when it
 *      constructs the child logger for the request
 */
const baseApp = new Elysia({ serve: { maxRequestBodySize: 1024 * 1024 * 2 } }) // 2mb
  .use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-debug-id"],
      credentials: true,
    }),
  );

const app = (otelPlugin ? baseApp.use(otelPlugin) : baseApp)
  .use(loggerPlugin())
  .get("/healthz", () => {
    if (isShuttingDown) {
      return new Response("Shutting down", { status: 503 });
    }
    return "OK";
  })
  .get("/readyz", async () => {
    if (isShuttingDown) {
      return new Response("Shutting down", { status: 503 });
    }

    const [dbHealthy, redisHealthy] = await Promise.all([isDbHealthy(), isRedisHealthy()]);

    const status = {
      db: dbHealthy ? "ok" : "error",
      redis: redisHealthy ? "ok" : "error",
      /*
       * informational only - never gates readiness. dev without Discord
       * creds is a supported (degraded) mode; this field just makes the
       * mode visible to uptime keyword checks
       */
      discord: isDiscordConfigured() ? "ok" : "not_configured",
    };

    if (!dbHealthy || !redisHealthy) {
      return new Response(JSON.stringify(status), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(status), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
  .all("/api/auth/*", async (context) => {
    const { request } = context;
    /*
     * narrow the request span from the wildcard `/api/auth/*` route to the
     * actual Better Auth sub-path (e.g. `/api/auth/sign-in/social`) so the
     * dashboard's slowest-endpoints view stops collapsing every auth
     * operation into one bucket. Better Auth doesn't expose a procedure-
     * style hook, so the URL pathname is the best identifier available here
     *
     * hard-capped at 256 chars so a crafted long path can't pollute the
     * span name and http.route attribute (cardinality explosion in the
     * slowest-endpoints view + attribute-size amplification). 256 is
     * generous for real Better Auth routes; anything longer is hostile
     */
    const pathname = new URL(request.url).pathname.slice(0, 256);
    const span = getCurrentSpan();
    if (span) {
      span.updateName(`${request.method} ${pathname}`);
      span.setAttribute("http.route", pathname);
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, POST" },
      });
    }

    /*
     * cross-instance rate limit for the auth surface. better-auth handles these
     * routes directly (outside the tRPC pipeline), so the tRPC middleware never
     * sees them - this is where /api/auth/* gets the same Redis limiter + IP
     * trust model as everything else. keyed per auth path so frequent session
     * reads don't share a bucket with sign-in
     */
    let limit;
    try {
      limit = await rateLimitByIp(request.headers, pathname, RATE_LIMITS.auth);
    } catch {
      // getClientIp rejects a missing trusted IP when REQUIRE_CLOUDFLARE is on
      return new Response("Bad Request", { status: 400 });
    }
    if (!limit.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "retry-after": String(limit.retryAfter ?? RATE_LIMITS.auth.windowSeconds),
        },
      });
    }

    return auth.handler(request);
  })
  .all("/trpc/*", async (context) => {
    const res = await fetchRequestHandler({
      endpoint: "/trpc",
      router: appRouter,
      req: context.request,
      createContext: () => createContext({ context }),
    });
    return res;
  })
  .use(discordInteractions)
  .get("/", () => "OK")
  .listen({ hostname: env.HOST, port: env.PORT }, () => {
    /*
     * enrich the boot event with deploy identity so error spikes can be
     * correlated to a specific deploy in BS dashboards. Railway exposes
     * RAILWAY_GIT_COMMIT_SHA + RAILWAY_DEPLOYMENT_ID; both are optional
     * (absent in local dev) so spread conditionally
     */
    log.info("Server started", {
      port: env.PORT,
      ...(process.env.RAILWAY_GIT_COMMIT_SHA
        ? { "deploy.commit_sha": process.env.RAILWAY_GIT_COMMIT_SHA }
        : {}),
      ...(process.env.RAILWAY_DEPLOYMENT_ID
        ? { "deploy.id": process.env.RAILWAY_DEPLOYMENT_ID }
        : {}),
    });
  });

/*
 * catch errors that escape the request lifecycle entirely. fire-and-forget
 * background work that rejected without a handler, top-level boot errors,
 * async edge cases in third-party libs. without these, an unhandled rejection
 * would crash the process silently in Bun with only stderr noise. reportError
 * routes both into the standard error pipeline so they show up in the same
 * BS query / Discord alert as everything else
 */
process.on("uncaughtException", (err) => {
  reportError(err, { source: "uncaughtException" });
});
process.on("unhandledRejection", (reason) => {
  reportError(reason, { source: "unhandledRejection" });
});

async function gracefulShutdown(signal: string): Promise<void> {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    log.info("Graceful shutdown starting", { signal });
    isShuttingDown = true;

    try {
      log.info("Stopping server");
      await app.stop();
    } catch (error) {
      log.error("Failed to stop server", { error });
    }

    try {
      log.info("Closing Redis");
      await closeRedis();
    } catch (error) {
      log.error("Failed to close Redis", { error });
    }

    /*
     * flush OTel before process.exit so the last few seconds of spans
     * reach Better Stack instead of dying in the in-memory
     * BatchSpanProcessor queue. shutdownOtel is bounded internally so a
     * slow exporter can't hang the pod past its grace period
     */
    try {
      log.info("Flushing OTel");
      await shutdownOtel();
    } catch (error) {
      log.error("Failed to flush OTel", { error });
    }

    log.info("Shutdown complete");
    process.exit(0);
  })();

  return shutdownPromise;
}

process.once("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});
