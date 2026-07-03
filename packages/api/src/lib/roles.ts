import type { UserRole } from "@skowt-monorepo/db/schema/auth";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  contributor: 1,
  staff: 2,
  developer: 3,
};

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function parseUserRole(role: unknown): UserRole {
  if (typeof role === "string" && Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, role)) {
    return role as UserRole;
  }
  return "user";
}

/* whether the user's role allows bypassing the moderation queue. developer
   only: staff moderate the queue but their own uploads still go through it */
export function shouldSkipQueue(role: unknown): boolean {
  return parseUserRole(role) === "developer";
}

// whether the user can modify a resource they don't own (staff+)
export function canModifyResource(userId: string, ownerId: string, role: unknown): boolean {
  if (userId === ownerId) return true;
  return hasMinimumRole(parseUserRole(role), "staff");
}
