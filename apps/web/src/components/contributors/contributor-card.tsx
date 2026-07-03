import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { UserHandle } from "@/components/ui/user-handle";
import { useRefreshDiscordProfile } from "@/hooks/use-refresh-discord-profile";

interface Contributor {
  id: string;
  name: string;
  displayName: string | null;
  image: string | null;
  role: string;
}

interface ContributorCardProps {
  contributor: Contributor;
  className?: string;
}

export function ContributorCard({ contributor, className }: ContributorCardProps) {
  const displayName = contributor.displayName || contributor.name;
  const refresh = useRefreshDiscordProfile();

  return (
    <div
      className={cn("surface-raised flex flex-col items-center gap-3 p-5 rounded-xl", className)}
    >
      <Avatar className="size-12">
        {contributor.image && (
          <AvatarImage
            src={contributor.image}
            alt={displayName}
            onLoadingStatusChange={(status) => {
              if (status === "error") refresh(contributor.id);
            }}
          />
        )}
        <AvatarFallback className="surface-well text-sm text-muted-foreground">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-col items-center gap-0.5 min-w-0 w-full">
        <UserHandle username={displayName} role={contributor.role} className="text-sm max-w-full" />
        <p className="text-xs text-muted-foreground truncate max-w-full">@{contributor.name}</p>
      </div>
    </div>
  );
}
