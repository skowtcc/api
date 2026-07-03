import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

interface SidebarNavItemProps {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

export function SidebarNavItem({ to, icon: Icon, label }: SidebarNavItemProps) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-3 h-9 px-3 rounded-md text-sm"
      activeProps={{
        className: "surface-nav-active",
      }}
      inactiveProps={{
        className: cn(
          "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:surface-nav-hover",
        ),
      }}
    >
      <Icon className="size-[18px] shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
