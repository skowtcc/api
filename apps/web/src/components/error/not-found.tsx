import { Link } from "@tanstack/react-router";
import { IconArrowLeft as ArrowLeftIcon } from "nucleo-micro-bold";
import { cdnAssetUrl } from "@/lib/api-transforms";

/* illustration above the message, same family as the site's other empty
   states. set to a catalog asset id (cdnAssetUrl) - null hides the slot */
const NOT_FOUND_IMAGE_ID: string | null = "01983921-8f28-70d5-8e78-556aa0936fef";

export function NotFound() {
  return (
    <div className="page-container min-h-[70svh] flex flex-col items-center justify-center py-16">
      {NOT_FOUND_IMAGE_ID && (
        <img
          src={cdnAssetUrl(NOT_FOUND_IMAGE_ID)}
          alt=""
          className="mb-6 max-h-40 w-auto object-contain select-none pointer-events-none"
          loading="lazy"
          draggable={false}
        />
      )}

      <div className="text-center mb-8">
        <p className="text-display text-4xl md:text-5xl text-foreground tracking-tight mb-3">
          Page not found
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>

      <Link
        to="/"
        className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 rounded-full border border-border/50 px-4 py-1.5 hover:border-border hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
        Back to home
      </Link>
    </div>
  );
}
