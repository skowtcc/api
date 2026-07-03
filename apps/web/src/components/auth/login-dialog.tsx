import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

interface LoginDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function LoginDialog({ children, open, onOpenChange }: LoginDialogProps) {
  const { signIn } = useAuth();
  const trpc = useTRPC();
  /* discordAuth is only ever false in dev (prod requires the creds at boot),
     so the disabled state + hint below are developer-facing */
  const { data: capabilities } = useQuery(trpc.capabilities.queryOptions());
  const discordAuthAvailable = capabilities?.discordAuth ?? true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm gap-0 p-2 !bg-background-surface overflow-hidden !rounded-xl"
      >
        <div className="bg-background rounded-lg border border-border px-6 py-8 flex flex-col items-center text-center">
          <DialogHeader className="mb-6 items-center">
            <DialogTitle className="text-display text-lg">Sign in to skowt.cc</DialogTitle>
            <DialogDescription className="text-sm">
              Sign in with Discord to continue.
            </DialogDescription>
          </DialogHeader>

          <Button
            data-haptic="action"
            onClick={signIn}
            disabled={!discordAuthAvailable}
            variant="discord"
            className="w-full h-10 gap-2"
          >
            <DiscordIcon className="size-4" />
            Sign in with Discord
          </Button>

          {!discordAuthAvailable && (
            <p className="text-xs text-muted-foreground mt-3">
              Discord OAuth isn't configured - set <code>DISCORD_CLIENT_ID</code> /{" "}
              <code>DISCORD_CLIENT_SECRET</code> in <code>apps/server/.env</code> (see the README).
            </p>
          )}

          <DialogClose asChild>
            <Link
              to="/faq"
              className="text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
            >
              I don't have Discord
            </Link>
          </DialogClose>
        </div>

        <div className="px-4 py-3">
          <p className="text-[0.6875rem] text-muted-foreground text-center">
            You must also be a member of our Discord server to access downloads.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
