import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useRefreshDiscordProfile } from "@/hooks/use-refresh-discord-profile";

interface ApiUser {
  id: string;
  name: string | null;
  image: string | null;
  role?: string | null;
}

export function UserAvatar({ user, size = "md" }: { user: ApiUser; size?: "sm" | "md" }) {
  const sizeClasses = size === "sm" ? "size-8 text-[10px]" : "size-10 text-xs";
  const initials = (user.name ?? "??").slice(0, 2).toUpperCase();
  const refresh = useRefreshDiscordProfile();
  const [broken, setBroken] = useState(false);

  /* reset broken when the URL changes (e.g., after a successful refresh) so
     the new URL gets a fresh attempt */
  useEffect(() => {
    setBroken(false);
  }, [user.image]);

  if (user.image && !broken) {
    return (
      <img
        src={user.image}
        alt={user.name ?? "User"}
        className={cn("rounded-full shrink-0 object-cover", sizeClasses)}
        onError={() => {
          setBroken(true);
          refresh(user.id);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center font-medium text-muted-foreground shrink-0",
        sizeClasses,
      )}
    >
      {initials}
    </div>
  );
}
