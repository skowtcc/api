import { Buffer } from "node:buffer";

/* opaque keyset cursor: a base64url-encoded JSON payload. the encode/decode
   envelope is shared across routers; each caller supplies its own payload shape
   and a validator, so a malformed, truncated, or hand-edited cursor decodes to
   `null` (pagination then falls back to the first page) rather than throwing.
   a non-JSON parse error is swallowed; anything else is a real bug and rethrows */

export function encodeCursor<T extends Record<string, unknown>>(payload: T): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor<T>(
  cursor: string,
  validate: (raw: Record<string, unknown>) => T | null,
): T | null {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    return validate(raw as Record<string, unknown>);
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}
