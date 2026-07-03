import { cn } from "@/lib/utils";
import { roleConfig, type UserRole } from "@/constants/roles";

interface UserHandleProps {
  /** the user's handle / username */
  username: string | null | undefined;
  /** the user's role; non-role users render plain, no colour */
  role?: UserRole | string | null;
  className?: string;
}

/**
 * Renders a user's name in their role colour - identity lives in the name
 * itself, no badge, no icon. Non-role users render plain (inherits colour).
 */
export function UserHandle({ username, role, className }: UserHandleProps) {
  const config =
    role && role !== "user" && role in roleConfig
      ? roleConfig[role as Exclude<UserRole, "user">]
      : null;
  const label = username ?? "Unknown";

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium leading-none min-w-0",
        config?.className,
        className,
      )}
    >
      <span className="truncate leading-none">{label}</span>
    </span>
  );
}
