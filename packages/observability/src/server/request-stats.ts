import { AsyncLocalStorage } from "node:async_hooks";

/*
 * per-request stats surfaced on the wide event for cheap pattern-spotting in
 * the BS Logs Explorer:
 *
 *   db.queries_count > 50    -> flags an N+1 without opening a trace
 *   fetch.calls_count > 10   -> flags a runaway upstream loop
 *   rpc.methods contains X   -> finds every log row for a given procedure
 *   user_id = X              -> finds every authed-user request
 *   rpc.error_code = X       -> finds every procedure failure of a given kind
 *
 * lives in AsyncLocalStorage so callers (tracedClient, fetch wrapper, tRPC
 * tracing middleware) write counters and identity bits without needing a
 * request-object reference passed through every call site. Bun supports the
 * full node:async_hooks API; AsyncLocalStorage propagates across awaits inside
 * the Elysia handler chain, the tRPC adapter, Drizzle, and the fetch wrapper.
 *
 * lifecycle: the store is entered at request start via beginRequestStats() in
 * loggerPlugin's onRequest, read at request end in the enrich callback, and
 * cleared by endRequestStats() in onAfterResponse so any fire-and-forget work
 * spawned from the handler can't keep bumping counters after the wide event
 * has already shipped.
 *
 * db.queries_count caveat: createContext calls auth.api.getSession on every
 * tRPC request, which goes through tracedClient and bumps dbQueries by 1
 * (or more, on session+account multi-row lookups). read N+1 thresholds with
 * this baseline in mind: "50 queries is bad" means "49 from the procedure
 * plus baseline auth overhead". public procedures that do zero DB work will
 * still show dbQueries >= 1
 */

export type RequestStats = {
  dbQueries: number;
  fetchCalls: number;
  /** tRPC procedure paths invoked by this request. multiple entries for batched calls */
  procedures: string[];
  /** authenticated user ID, set by the tRPC tracing middleware when ctx.session is present */
  userId?: string;
  /** client-side debug ID from x-debug-id header. stored here (not just on the span) so
   * reportError can pull it without traversing back to the root span's attributes */
  debugId?: string;
  /** last tRPC error code (e.g. "UNAUTHORIZED") observed this request */
  errorCode?: string;
};

/*
 * store is undefined-able so endRequestStats can drop the per-request context.
 * all bump/record helpers tolerate undefined (early return), so calls from
 * non-request contexts (background jobs, boot-time, post-response work) no-op
 */
const storage = new AsyncLocalStorage<RequestStats | undefined>();

/*
 * begin a fresh stats context for the current request. called once per request
 * from the Elysia loggerPlugin's onRequest. `enterWith` (not `run`) lets later
 * Elysia lifecycle hooks (handler, onAfterHandle, enrich) see the same store
 * without needing to wrap them in a callback
 */
export function beginRequestStats(): void {
  storage.enterWith({
    dbQueries: 0,
    fetchCalls: 0,
    procedures: [],
  });
}

/*
 * clear the per-request stats store. called from the Elysia loggerPlugin's
 * onAfterResponse so any fire-and-forget background work spawned during the
 * request (`void doThing()`, queueMicrotask, setImmediate) inherits the
 * cleared state and its bumps no-op instead of accumulating in the request's
 * already-emitted wide event.
 *
 * the AsyncLocalStorage frame itself persists until the async chain unwinds;
 * the frame can't be disposed, but the store inside it can be nulled out so
 * subsequent reads return undefined
 */
export function endRequestStats(): void {
  storage.enterWith(undefined);
}

/*
 * read the current request's stats snapshot, or undefined when called outside
 * any request (background jobs, boot-time, tests without an active store, or
 * after endRequestStats has cleared the store post-response)
 */
export function getRequestStats(): RequestStats | undefined {
  return storage.getStore();
}

export function bumpDbQueries(): void {
  const stats = storage.getStore();
  if (stats) stats.dbQueries += 1;
}

export function bumpFetchCalls(): void {
  const stats = storage.getStore();
  if (stats) stats.fetchCalls += 1;
}

export function recordProcedure(path: string): void {
  const stats = storage.getStore();
  if (stats) stats.procedures.push(path);
}

export function recordUserId(userId: string): void {
  const stats = storage.getStore();
  if (stats) stats.userId = userId;
}

export function recordDebugId(debugId: string): void {
  const stats = storage.getStore();
  if (stats) stats.debugId = debugId;
}

export function recordErrorCode(code: string): void {
  const stats = storage.getStore();
  if (stats) stats.errorCode = code;
}
