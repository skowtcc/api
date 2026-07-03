import { Link } from "@tanstack/react-router";
import { SidebarNavItem } from "./sidebar-nav-item";
import { SelectionModeToggle } from "@/components/selection/selection-mode-toggle";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LoginDialog } from "@/components/auth/login-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { canUploadAssets, type UserRole } from "@/constants/roles";
import { UserHandle } from "@/components/ui/user-handle";
import { APP_VERSION } from "@/constants/version";
import { flatChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import {
  IconCompass as IconCompassFillDuo18,
  IconMegaphone as IconMegaphoneFillDuo18,
  IconBookmarkFilled as IconBookmarkFillDuo18,
  IconDownload as IconDownloadFillDuo18,
  IconGear as IconGearFillDuo18,
  IconCircleQuestion as IconCircleQuestionFillDuo18,
  IconArrowDoorOut as IconArrowDoorOutFillDuo18,
  IconUsers as IconUsersFillDuo18,
  IconClockRotateClockwise as IconClockRotateClockwiseFillDuo18,
  IconUpload as IconImagePlusFillDuo18,
  IconGauge as IconGaugeFillDuo18,
} from "nucleo-micro-bold";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const { isAuthenticated, user, signOut } = useAuth();
  const { triggerHaptic } = useHaptics();

  const userRole = user?.role as UserRole | undefined;
  const isDeveloper = userRole === "developer";
  const canUpload = canUploadAssets(userRole);

  return (
    <aside
      className={cn(
        "fixed top-3 left-3 bottom-3 w-[calc(var(--sidebar-width)-24px)] flex flex-col glass-panel rounded-2xl z-40",
        className,
      )}
      // floats the rail off the page - soft shadow casts right onto the content
      style={{
        boxShadow: "16px 0 48px -18px oklch(0 0 0 / 0.55), 0 12px 32px -16px oklch(0 0 0 / 0.38)",
      }}
    >
      <div className="px-6 h-14 flex items-center gap-2 shrink-0">
        <Link to="/" className="text-lg font-bold tracking-tight text-foreground">
          skowt.cc
        </Link>
        <Link
          to="/changelog"
          title="View changelog"
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono tracking-tight transition-opacity hover:opacity-85 translate-y-px"
          style={flatChipStyle(ACCENT_CHIP_COLOR, 16)}
        >
          {APP_VERSION}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="space-y-0.5">
          <SidebarNavItem to="/" icon={IconCompassFillDuo18} label="Browse" />
          <SidebarNavItem to="/requests" icon={IconMegaphoneFillDuo18} label="Requests" />
          {canUpload && (
            <SidebarNavItem to="/uploads" icon={IconImagePlusFillDuo18} label="Upload" />
          )}
          {isDeveloper && (
            <SidebarNavItem to="/dashboard" icon={IconGaugeFillDuo18} label="Dashboard" />
          )}
        </div>

        <div className="h-px bg-border/20 my-3" />

        {isAuthenticated && (
          <>
            <div className="space-y-0.5">
              <SidebarNavItem to="/saved" icon={IconBookmarkFillDuo18} label="Saved" />
              <SidebarNavItem to="/downloads" icon={IconDownloadFillDuo18} label="Downloads" />
            </div>

            <div className="h-px bg-border/20 my-3" />
          </>
        )}

        <div className="space-y-0.5">
          <SidebarNavItem to="/settings" icon={IconGearFillDuo18} label="Settings" />
          <SidebarNavItem to="/faq" icon={IconCircleQuestionFillDuo18} label="FAQ" />
          <SidebarNavItem to="/contributors" icon={IconUsersFillDuo18} label="Contributors" />
          <SidebarNavItem
            to="/changelog"
            icon={IconClockRotateClockwiseFillDuo18}
            label="Changelog"
          />
        </div>
      </nav>

      <div className="px-3 py-3 space-y-2 border-t border-border/20">
        <SelectionModeToggle className="w-full justify-start" />

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <Avatar className="size-7 shrink-0">
              <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
              <AvatarFallback className="text-[10px]">
                {user.name?.slice(0, 2).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 flex flex-col gap-1 items-start">
              <UserHandle username={user.name} role={userRole} className="text-sm max-w-full" />
            </div>
            <button
              onClick={() => {
                triggerHaptic(HAPTIC.LIGHT_ACTION);
                signOut();
              }}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Sign out"
            >
              <IconArrowDoorOutFillDuo18 className="size-4" />
            </button>
          </div>
        ) : (
          <LoginDialog>
            <button
              onClick={() => triggerHaptic(HAPTIC.LIGHT_ACTION)}
              className="surface-accent-soft-pressable flex items-center justify-center gap-2 w-full h-9 px-3 text-sm font-medium rounded-md"
            >
              Sign in
            </button>
          </LoginDialog>
        )}
      </div>
    </aside>
  );
}
