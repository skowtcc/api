import type { ComponentType } from "react";
import { IconCode, IconShieldUserFilled, IconHeartHand } from "nucleo-micro-bold";

export type UserRole = "user" | "contributor" | "staff" | "developer";

export interface RoleConfig {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** text color utility for inline label use */
  className: string;
}

/* mirror the API's role gates so nav/pages can't drift from the server:
   uploads are contributor+ (contributorProcedure), skip-approval is
   developer-only (shouldSkipQueue) */
const ROLE_ORDER: Record<UserRole, number> = {
  user: 0,
  contributor: 1,
  staff: 2,
  developer: 3,
};

export function canUploadAssets(role: UserRole | undefined): boolean {
  return !!role && ROLE_ORDER[role] >= ROLE_ORDER.contributor;
}

export function canSkipApproval(role: UserRole | undefined): boolean {
  return role === "developer";
}

export const roleConfig: Record<Exclude<UserRole, "user">, RoleConfig> = {
  developer: {
    label: "Developer",
    icon: IconCode,
    className: "text-role-developer",
  },
  staff: {
    label: "Moderator",
    icon: IconShieldUserFilled,
    className: "text-role-staff",
  },
  contributor: {
    label: "Contributor",
    icon: IconHeartHand,
    className: "text-role-contrib",
  },
};
