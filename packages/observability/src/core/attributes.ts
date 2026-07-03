/*
 * field-name conventions for wide events shipped to Better Stack
 *
 * ============================================================================
 *  why this file exists
 * ============================================================================
 *
 * wide events accumulate context from many call sites. if one site sets `userId`
 * and another sets `user_id` and a third sets `uid`, BS queries become unreliable
 * ("show me all events for user X" needs three OR clauses). this file documents the
 * one canonical spelling per concept so the codebase converges on it.
 *
 * enforcement is by convention + code review (not lint). the constant values
 * below are the source of truth. use them when emitting events:
 *
 *   log.set({ [ATTRIBUTES.USER_ID]: user.id });    // good
 *   log.set({ userId: user.id });                  // tolerated but not recommended
 *
 * promote to typed lint enforcement only if drift recurs across multiple PRs
 *
 * ============================================================================
 *  vocabulary policy
 * ============================================================================
 *
 * three classes of field name appear in our events:
 *
 * 1. OTel-standard fields (HTTP semantic conventions v1.27, resource attributes)
 *    use the OTel spec name verbatim. dotted notation, lowercase.
 *      http.request.method, url.path, http.response.status_code,
 *      service.name, deployment.environment, etc.
 *    the Elysia plugin (elysia-plugin.ts) renames evlog's defaults to these on
 *    every request.
 *
 * 2. skowt operational identifiers (explicitly not redacted)
 *    snake_case. no vendor namespacing. these are first-party fields skowt owns.
 *      user_id, asset_id, request_id, trace_id, span_id, parent_span_id,
 *      job_id, job_name, discord_user_id.
 *    queryable by design. they identify a row, not credentials.
 *
 * 3. hashed PII fields
 *    snake_case. always paired with an _epoch field when the underlying secret
 *    rotates (quarterly key rotation), so cross-epoch correlation works.
 *      ip_hash, ip_hash_epoch.
 *
 * ============================================================================
 *  naming rules (canonical)
 * ============================================================================
 *
 *  - snake_case for all skowt-owned fields. camelCase is reserved for nothing
 *    here. avoid it. evlog defaults use camelCase but the Elysia plugin renames
 *    them so they never reach BS in that form.
 *
 *  - suffix conventions:
 *      _id      : opaque identifier (user_id, asset_id)
 *      _ms      : duration in milliseconds, number not string
 *      _at      : ISO 8601 timestamp string
 *      _count   : non-negative integer
 *      _hash    : the result of HMAC/SHA over a value
 *      _epoch   : rotation epoch label (e.g., "2026-Q2") to pair with a _hash
 *
 *  - when in doubt, mirror OTel semconv (https://opentelemetry.io/docs/specs/semconv/)
 *    even for fields outside HTTP. if OTel has a name for it, use that
 *
 *  - never reuse a name across signal types. if you have `duration_ms` on a wide
 *    event and `duration` on a span attribute, queries cross-referencing them
 *    will silently miss. either rename one, or pick one and stick with it
 *
 * ============================================================================
 *  known attribute names (canonical constants)
 * ============================================================================
 */

export const ATTRIBUTES = {
  // operational identifiers (explicitly not redacted)
  USER_ID: "user_id",
  ASSET_ID: "asset_id",
  REQUEST_ID: "request_id",
  TRACE_ID: "trace_id",
  SPAN_ID: "span_id",
  PARENT_SPAN_ID: "parent_span_id",
  JOB_ID: "job_id",
  JOB_NAME: "job_name",
  DISCORD_USER_ID: "discord_user_id",
  /* client-generated stable ID (UUID, localStorage) sent as x-debug-id header.
   * present on every request from a browser that has run the app at least once;
   * absent for direct API hits without the header. lets support find a user's
   * recent requests in BS even when the user isn't authed */
  DEBUG_ID: "debug_id",

  // service taxonomy
  SERVICE: "service",
  ENVIRONMENT: "environment",

  /* OTel HTTP semantic conventions v1.27
   * (elysia-plugin.ts auto-renames evlog defaults to these) */
  HTTP_REQUEST_METHOD: "http.request.method",
  HTTP_RESPONSE_STATUS_CODE: "http.response.status_code",
  URL_PATH: "url.path",

  // timing
  DURATION_MS: "duration_ms",
  TIMESTAMP: "timestamp",

  // background-job telemetry
  JOB_RESULT: "job_result", // "success" | "failed" | "skipped"
  JOB_ENQUEUED_AT: "job_enqueued_at",

  // hashed PII
  IP_HASH: "ip_hash",
  IP_HASH_EPOCH: "ip_hash_epoch",

  // browser-originated event metadata (populated server-side)
  BROWSER_EVENT_RAW: "browser_event.raw",
  BROWSER_USER_AGENT: "user_agent",
} as const;
