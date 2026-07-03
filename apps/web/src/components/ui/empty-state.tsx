import { cn } from "@/lib/utils";

interface EmptyStateProps {
  message: string;
  /** optional illustration shown above the message (decorative) */
  image?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ message, image, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16", className)}>
      {image && (
        <img
          src={image}
          alt=""
          className="mb-4 max-h-40 w-auto object-contain select-none pointer-events-none"
          loading="lazy"
          draggable={false}
        />
      )}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 rounded-full border border-border/50 px-4 py-1.5 hover:border-border"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
