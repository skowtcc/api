import { Link, useLocation } from "@tanstack/react-router";
import {
  IconCompass as IconCompassFillDuo18,
  IconMegaphone as IconMegaphoneFillDuo18,
  IconBookmarkFilled as IconBookmarkFillDuo18,
  IconGear as IconGearFillDuo18,
  IconStack,
  IconStackFilled,
  IconDownload,
  IconGear,
  IconCircleQuestion,
  IconUsers,
  IconArrowDoorIn,
  IconArrowDoorOut,
  IconUpload,
  IconGauge,
} from "nucleo-micro-bold";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerGroup,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
} from "@/components/dropdrawer";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LoginDialog } from "@/components/auth/login-dialog";
import { useSelectionStore } from "@/stores/selection-store";
import { useAuth } from "@/hooks/use-auth";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { canUploadAssets, type UserRole } from "@/constants/roles";
import { UserHandle } from "@/components/ui/user-handle";
import { cn } from "@/lib/utils";

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

function NavItem({ to, icon, label }: NavItemProps) {
  const location = useLocation();
  const isActive = location.pathname === to;
  const { triggerHaptic } = useHaptics();

  return (
    <Link
      to={to}
      onClick={() => triggerHaptic(HAPTIC.LIGHT_ACTION)}
      data-haptic="off"
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-lg relative mx-1",
        isActive ? "surface-nav-active" : "text-muted-foreground hover:surface-nav-hover",
      )}
    >
      <span className="size-5">{icon}</span>
      <span className="text-[10px] leading-none">{label}</span>
    </Link>
  );
}

function SelectNavItem() {
  const { isSelectMode, toggleSelectMode, getSelectedCount } = useSelectionStore();
  const { triggerHaptic } = useHaptics();
  const selectedCount = getSelectedCount();

  const handleToggle = () => {
    toggleSelectMode();
    triggerHaptic(isSelectMode ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);
  };

  return (
    <button
      onClick={handleToggle}
      data-haptic="off"
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-lg mx-1",
        isSelectMode ? "surface-nav-active" : "text-muted-foreground hover:surface-nav-hover",
      )}
      aria-pressed={isSelectMode}
      aria-label="Toggle select mode"
    >
      <span className="relative size-5 flex items-center justify-center">
        {isSelectMode ? <IconStackFilled className="size-5" /> : <IconStack className="size-5" />}
        {selectedCount > 0 && (
          <span className="surface-accent-solid absolute -top-1.5 -right-2.5 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 text-[9px] font-medium tabular-nums rounded-full">
            {selectedCount}
          </span>
        )}
      </span>
      <span className="text-[10px] leading-none">Select</span>
    </button>
  );
}

function LoginNavItem() {
  const { triggerHaptic } = useHaptics();

  return (
    <LoginDialog>
      <button
        onClick={() => triggerHaptic(HAPTIC.LIGHT_ACTION)}
        data-haptic="off"
        className="flex flex-col items-center justify-center gap-1 py-2.5 px-2 rounded-lg mx-1 text-muted-foreground hover:surface-nav-hover"
      >
        <span className="size-5 flex items-center justify-center">
          <IconArrowDoorIn className="size-5" />
        </span>
        <span className="text-[10px] leading-none">Login</span>
      </button>
    </LoginDialog>
  );
}

function AccountNavItem() {
  const { user, signOut } = useAuth();
  const { triggerHaptic } = useHaptics();
  const location = useLocation();

  if (!user) return null;

  const userRole = user.role as UserRole;
  const isDeveloper = userRole === "developer";
  const canUpload = canUploadAssets(userRole);

  const accountPages = ["/settings", "/downloads", "/faq", "/contributors"];
  const isActive = accountPages.some((p) => location.pathname === p);

  return (
    <DropDrawer>
      <DropDrawerTrigger asChild>
        <button
          onClick={() => triggerHaptic(HAPTIC.LIGHT_ACTION)}
          data-haptic="off"
          className={cn(
            "relative flex flex-col items-center justify-center gap-1 py-2 px-2 rounded-lg mx-1",
            isActive ? "surface-nav-active" : "text-muted-foreground hover:surface-nav-hover",
          )}
        >
          <Avatar className="size-5">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
            <AvatarFallback className="text-[8px]">
              {user.name?.slice(0, 2).toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <span className="text-[10px] leading-none">Account</span>
        </button>
      </DropDrawerTrigger>

      <DropDrawerContent>
        <div className="flex items-center gap-3 px-3 py-3">
          <Avatar className="size-10">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? "User"} />
            <AvatarFallback>{user.name?.slice(0, 2).toUpperCase() ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1 items-start">
            <UserHandle username={user.name} role={userRole} className="text-sm" />
          </div>
        </div>

        <DropDrawerSeparator />

        <DropDrawerGroup>
          <Link to="/downloads">
            <DropDrawerItem icon={<IconDownload className="size-4" />}>Downloads</DropDrawerItem>
          </Link>
          <Link to="/settings">
            <DropDrawerItem icon={<IconGear className="size-4" />}>Settings</DropDrawerItem>
          </Link>
          {canUpload && (
            <Link to="/uploads">
              <DropDrawerItem icon={<IconUpload className="size-4" />}>Upload</DropDrawerItem>
            </Link>
          )}
          {isDeveloper && (
            <Link to="/dashboard">
              <DropDrawerItem icon={<IconGauge className="size-4" />}>Dashboard</DropDrawerItem>
            </Link>
          )}
        </DropDrawerGroup>

        <DropDrawerSeparator />

        <DropDrawerGroup>
          <Link to="/faq">
            <DropDrawerItem icon={<IconCircleQuestion className="size-4" />}>FAQ</DropDrawerItem>
          </Link>
          <Link to="/contributors">
            <DropDrawerItem icon={<IconUsers className="size-4" />}>Contributors</DropDrawerItem>
          </Link>
        </DropDrawerGroup>

        <DropDrawerSeparator />

        <DropDrawerGroup>
          <DropDrawerItem
            variant="destructive"
            icon={<IconArrowDoorOut className="size-4" />}
            onClick={signOut}
          >
            Log out
          </DropDrawerItem>
        </DropDrawerGroup>
      </DropDrawerContent>
    </DropDrawer>
  );
}

export function MobileNav() {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="surface-drawer-bottom fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="grid grid-cols-5 items-stretch pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <NavItem to="/" icon={<IconCompassFillDuo18 className="size-5" />} label="Browse" />
        <NavItem
          to="/requests"
          icon={<IconMegaphoneFillDuo18 className="size-5" />}
          label="Requests"
        />

        <SelectNavItem />

        {isAuthenticated ? (
          <NavItem to="/saved" icon={<IconBookmarkFillDuo18 className="size-5" />} label="Saved" />
        ) : (
          <NavItem
            to="/settings"
            icon={<IconGearFillDuo18 className="size-5" />}
            label="Settings"
          />
        )}

        {isAuthenticated ? <AccountNavItem /> : <LoginNavItem />}
      </div>
    </nav>
  );
}
