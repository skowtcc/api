import { Link } from "@tanstack/react-router";
import { IconArrowLeft as ArrowLeftIcon, IconRefresh as ArrowPathIcon } from "nucleo-micro-bold";
import { cdnAssetUrl } from "@/lib/api-transforms";

// illustration above the message, same family as the site's other empty states
const ERROR_IMAGE_ID = "01983921-9a85-77b3-a311-23f0f39f9d1b";

interface ErrorBoundaryProps {
  error?: Error;
  reset?: () => void;
}

export function ErrorBoundary({ reset }: ErrorBoundaryProps) {
  return (
    <div className="page-container min-h-[70svh] flex flex-col items-center justify-center py-16">
      <img
        src={cdnAssetUrl(ERROR_IMAGE_ID)}
        alt=""
        className="mb-6 max-h-40 w-auto object-contain select-none pointer-events-none"
        loading="lazy"
        draggable={false}
      />

      <div className="text-center mb-8">
        <p className="text-display text-4xl md:text-5xl text-foreground tracking-tight mb-3">
          Internal Server Error
        </p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
          This error has been logged, try again later or refresh your page. If the issue isn't just
          happening for you it'll be fixed as soon as possible.
        </p>
      </div>

      <div className="flex items-center gap-6">
        {reset && (
          <button
            onClick={reset}
            className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 rounded-full border border-border/50 px-4 py-1.5 hover:border-border"
          >
            <ArrowPathIcon className="size-4 transition-transform duration-150 group-hover:rotate-45" />
            Try again
          </button>
        )}
        <Link
          to="/"
          className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 rounded-full border border-border/50 px-4 py-1.5 hover:border-border"
        >
          <ArrowLeftIcon className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
