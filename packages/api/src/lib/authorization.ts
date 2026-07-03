import { canModifyResource } from "./roles";
import { notFound, forbidden } from "./errors";

/* guards a mutation on a resource the caller is trying to modify. pass the row
   you just loaded (or undefined): this throws NOT_FOUND if it's missing, and
   FORBIDDEN unless the caller owns it or is staff+ (canModifyResource). returns
   the row narrowed non-null. collapses the repeated
     find -> if (!row) notFound -> if (!canModifyResource) forbidden
   preamble into one call so the ownership policy lives in a single place */
export function requireCanModify<T>(
  row: T | undefined,
  getOwnerId: (row: T) => string,
  session: { id: string; role: unknown },
  labels: { notFound: string; forbidden: string },
): T {
  if (!row) notFound(labels.notFound);
  if (!canModifyResource(session.id, getOwnerId(row), session.role)) {
    forbidden(labels.forbidden);
  }
  return row;
}
