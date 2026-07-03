/*
 * evlog server logger factory + bootstrap
 *
 * call initObservability() once at server bootstrap (apps/server/src/index.ts).
 * subsequent createLogger(namespace) calls share the configured drain pipeline,
 * service name, and emit timestamp authority
 */

import { createLogger as evlogCreateLogger, initLogger, log as evlogLog } from "evlog";
import { buildComposedDrain } from "./pipeline";

interface InitObservabilityOptions {
  /** service name. default: "skowt-server" */
  service?: string;
  /** environment label (production / development / staging) */
  environment?: string;
  /** Better Stack source token. omit to skip BS adapter (stdout-only) */
  betterStackToken?: string;
  /** Better Stack ingestion endpoint override */
  betterStackEndpoint?: string;
}

let _initialized = false;

/**
 * initialize the global evlog logger.
 *
 * idempotent. second call is a no-op. the drain pipeline (dual drain) and
 * service identity are set here once.
 *
 * dev fallback: when `betterStackToken` is absent (dev, local CI, missing env)
 * the pipeline includes only the stdout drain. every event still flows; nothing
 * silently drops. this is the load-bearing property that makes the BS env vars
 * required-in-prod but optional in dev. `apps/server` boots cleanly with no
 * Better Stack credentials and you see all events in your terminal
 */
export function initObservability(options: InitObservabilityOptions = {}): void {
  if (_initialized) return;

  const drain = buildComposedDrain({
    betterStackToken: options.betterStackToken,
    betterStackEndpoint: options.betterStackEndpoint,
  });

  initLogger({
    env: {
      service: options.service ?? "skowt-server",
      environment: options.environment ?? "development",
    },
    drain,
  });

  _initialized = true;
}

/**
 * Logger shape used by all existing call sites: info/warn/error/debug
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  /**
   * construct a wide-event builder. use for one-event-per-unit-of-work patterns
   * (e.g., a multi-step background job that accumulates context as it runs).
   * call .set({...}) to add fields, .emit() to flush
   */
  event(initialContext?: Record<string, unknown>): ReturnType<typeof evlogCreateLogger>;
}

/**
 * create a scoped logger for a given namespace.
 *
 * the namespace flows into every log line this logger emits as a `namespace`
 * field, so BS queries can filter by component (e.g., namespace == "discord-profile")
 */
export function createLogger(namespace: string, baseContext?: Record<string, unknown>): Logger {
  const baseFields = { namespace, ...baseContext };

  return {
    debug(message, context) {
      evlogLog.debug({ ...baseFields, message, ...context });
    },
    info(message, context) {
      evlogLog.info({ ...baseFields, message, ...context });
    },
    warn(message, context) {
      evlogLog.warn({ ...baseFields, message, ...context });
    },
    error(message, context) {
      evlogLog.error({ ...baseFields, message, ...context });
    },
    event(initialContext) {
      return evlogCreateLogger({ ...baseFields, ...initialContext });
    },
  };
}

/**
 * create a scoped logger for background jobs (service: skowt-server.background).
 *
 * sets the `service` field per-event to override the default `skowt-server`, so
 * BS queries can isolate background-job failure rates from request-path failure
 * rates.
 *
 * no callers use this yet; exported so the API surface stays stable. it's
 * intended for enqueueLazyProfileRefresh and the other background-job sites
 */
export function createBackgroundLogger(jobName: string, baseContext?: Record<string, unknown>) {
  return evlogCreateLogger({
    service: "skowt-server.background",
    namespace: "background",
    job_name: jobName,
    ...baseContext,
  });
}
