import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "surface-well file:text-foreground placeholder:text-muted-foreground selection:bg-bronze-face selection:text-bronze-foreground flex h-9 w-full min-w-0 rounded-md px-3 py-1 text-base outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bronze-top",
        "aria-invalid:outline-2 aria-invalid:outline-offset-1 aria-invalid:outline-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
