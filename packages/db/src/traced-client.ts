import type {
  Client,
  InStatement,
  ResultSet,
  Replicated,
  Transaction,
  TransactionMode,
} from "@libsql/client";
import { wrapInSpan, getCurrentSpan, bumpDbQueries } from "@skowt-monorepo/observability/server";

/*
 * span every libsql call so the Better Stack DB-ops view stops being a single
 * "FINDONE" pie slice (which is just Better Auth's internal session lookup) and
 * starts showing real SELECT/INSERT/UPDATE/DELETE distribution
 */

/*
 * wrapping happens at the libsql Client boundary, one level below Drizzle,
 * because Drizzle's `Logger` interface only sees the rendered SQL *before*
 * execution and has no completion or error hook, so it can't drive a span's
 * lifetime accurately. the libsql Client's `execute`/`batch` *are* the leaf
 * async calls, so wrapping them gives a faithful start-to-finish span
 */

/*
 * attributes follow OTel database semantic conventions v1.27:
 *   db.system.name    -> "sqlite" (libsql speaks the SQLite wire protocol)
 *   db.query.text     -> SQL with bind placeholders, never interpolated values
 *   db.operation.name -> leading SQL verb (SELECT, INSERT, UPDATE, ...)
 *   db.statement_count -> batch size, batch spans only
 */

/*
 * bound argument values are deliberately omitted. libsql passes them out-of-band
 * (never inlined into db.query.text), so the recorded SQL contains only the
 * parameter placeholders. that keeps PII out of traces without extra redaction
 * work. if a caller drops a value into the SQL string via template
 * interpolation rather than parameter binding, that's a pre-existing leak this
 * wrapper neither creates nor hides
 */

/*
 * implementation note: a Proxy can't be used here because libsql's Client is a
 * class instance with private (`#`) fields, and accessing them through a Proxy
 * throws TypeError. explicit delegation works, costs one allocation per
 * `createClient` call (irrelevant), and keeps the method surface honest: if
 * libsql adds a new method, it surfaces as a missing field on the returned
 * object instead of silently passing through with no instrumentation
 */

/*
 * OTel db.query.text is unbounded by default. Drizzle's inArray() with a
 * large id list (e.g. several thousand IDs) renders SQL that's tens of KB.
 * per-span attribute payload at that scale inflates the BatchSpanProcessor
 * queue and can push individual OTLP requests past Better Stack's body
 * limits, causing the entire batch to be silently dropped. cap at 4KB and
 * flag the truncation on the span so it's debuggable in BS
 */
const MAX_SQL_TEXT_BYTES = 4 * 1024;

function sqlOf(stmt: InStatement): string {
  return typeof stmt === "string" ? stmt : stmt.sql;
}

function operationOf(sql: string): string {
  const verb = sql.trimStart().match(/^[A-Za-z]+/)?.[0];
  return verb ? verb.toUpperCase() : "UNKNOWN";
}

/*
 * wrap a Transaction the same way as the Client so queries inside
 * `db.transaction(async tx => ...)` are visible. without this, every write-path
 * procedure (bookmark.toggle, uploads, admin actions, request create/vote)
 * emits zero db spans. the Transaction object returned by libsql is a fresh
 * instance with its own methods, none of which go through the Client's
 * `execute`/`batch` instrumented above
 */

/*
 * each query inside a transaction picks up `db.in_transaction=true` so the
 * dashboard can split per-statement timing inside vs outside transactions.
 * useful when a long-held write transaction starts queueing reads
 */
function wrapTransaction(tx: Transaction): Transaction {
  return {
    execute(stmt: InStatement): Promise<ResultSet> {
      const sql = sqlOf(stmt);
      const operation = operationOf(sql);
      const truncated = sql.length > MAX_SQL_TEXT_BYTES;
      bumpDbQueries();
      return wrapInSpan(`db.${operation}`, async () => {
        getCurrentSpan()?.setAttributes({
          // OTel db semconv v1.27 (current)
          "db.system.name": "sqlite",
          "db.query.text": truncated ? sql.slice(0, MAX_SQL_TEXT_BYTES) : sql,
          "db.operation.name": operation,
          /*
           * OTel db semconv v1.16 (still in spec; BS dashboards and most
           * third-party tooling key off these older names, so emit both):
           */
          "db.system": "sqlite",
          "db.statement": truncated ? sql.slice(0, MAX_SQL_TEXT_BYTES) : sql,
          "db.operation": operation,
          "db.in_transaction": true,
          ...(truncated ? { "db.query.text_truncated": true } : {}),
        });
        return tx.execute(stmt);
      });
    },

    batch(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
      bumpDbQueries();
      return wrapInSpan("db.BATCH", async () => {
        getCurrentSpan()?.setAttributes({
          "db.system.name": "sqlite",
          "db.system": "sqlite",
          "db.operation.name": "BATCH",
          "db.operation": "BATCH",
          "db.statement_count": stmts.length,
          "db.in_transaction": true,
        });
        return tx.batch(stmts);
      });
    },

    executeMultiple(sql: string): Promise<void> {
      return tx.executeMultiple(sql);
    },

    rollback(): Promise<void> {
      /*
       * libsql commit/rollback are network round-trips to Turso. without these
       * spans, a procedure that holds a transaction open for 800ms shows
       * child query spans summing to 50ms and an unexplained 750ms gap
       */
      return wrapInSpan("db.ROLLBACK", async () => {
        getCurrentSpan()?.setAttributes({
          "db.system.name": "sqlite",
          "db.system": "sqlite",
          "db.operation.name": "ROLLBACK",
          "db.operation": "ROLLBACK",
          "db.in_transaction": true,
        });
        return tx.rollback();
      });
    },

    commit(): Promise<void> {
      return wrapInSpan("db.COMMIT", async () => {
        getCurrentSpan()?.setAttributes({
          "db.system.name": "sqlite",
          "db.system": "sqlite",
          "db.operation.name": "COMMIT",
          "db.operation": "COMMIT",
          "db.in_transaction": true,
        });
        return tx.commit();
      });
    },

    close(): void {
      tx.close();
    },

    get closed(): boolean {
      return tx.closed;
    },
  };
}

export function tracedClient(client: Client): Client {
  return {
    execute(stmt: InStatement): Promise<ResultSet> {
      const sql = sqlOf(stmt);
      const operation = operationOf(sql);
      const truncated = sql.length > MAX_SQL_TEXT_BYTES;
      bumpDbQueries();
      return wrapInSpan(`db.${operation}`, async () => {
        getCurrentSpan()?.setAttributes({
          // v1.27 + v1.16 dual emission; see Transaction.execute for rationale
          "db.system.name": "sqlite",
          "db.query.text": truncated ? sql.slice(0, MAX_SQL_TEXT_BYTES) : sql,
          "db.operation.name": operation,
          "db.system": "sqlite",
          "db.statement": truncated ? sql.slice(0, MAX_SQL_TEXT_BYTES) : sql,
          "db.operation": operation,
          ...(truncated ? { "db.query.text_truncated": true } : {}),
        });
        return client.execute(stmt);
      });
    },

    batch(stmts: Array<InStatement>, mode?: TransactionMode): Promise<Array<ResultSet>> {
      bumpDbQueries();
      return wrapInSpan("db.BATCH", async () => {
        getCurrentSpan()?.setAttributes({
          "db.system.name": "sqlite",
          "db.system": "sqlite",
          "db.operation.name": "BATCH",
          "db.operation": "BATCH",
          "db.statement_count": stmts.length,
        });
        return client.batch(stmts, mode);
      });
    },

    migrate(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
      return client.migrate(stmts);
    },

    async transaction(mode?: TransactionMode): Promise<Transaction> {
      return wrapTransaction(await client.transaction(mode));
    },

    executeMultiple(sql: string): Promise<void> {
      return client.executeMultiple(sql);
    },

    sync(): Promise<Replicated> {
      return client.sync();
    },

    close(): void {
      client.close();
    },

    get closed(): boolean {
      return client.closed;
    },

    get protocol(): string {
      return client.protocol;
    },

    reconnect(): void {
      client.reconnect();
    },
  };
}
