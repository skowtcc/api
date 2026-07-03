import { Link, useRouter, useCanGoBack } from "@tanstack/react-router";
import { IconArrowLeft } from "nucleo-micro-bold";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";

interface GoBackProps {
  to?: string;
  label?: string;
  className?: string;
}

export function GoBack({ to = "/", label = "Back", className }: GoBackProps) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  /* prefer a real history-back so the previous page's filters + scroll position
     are preserved (e.g. return to /?games=… from an asset). fall back to `to`
     when there's nothing to go back to - a direct load or shared link */
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (canGoBack) {
      e.preventDefault();
      router.history.back();
    }
  };

  return (
    <Link
      to={to}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150",
        className,
      )}
    >
      <IconArrowLeft className="size-4" />
      {label}
    </Link>
  );
}
