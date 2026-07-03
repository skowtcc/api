import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { IconCheck as CheckIcon } from "nucleo-micro-bold";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer surface-well data-[state=checked]:surface-accent-solid data-[state=checked]:text-bronze-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-top aria-invalid:outline-2 aria-invalid:outline-offset-1 aria-invalid:outline-destructive size-4 shrink-0 rounded-[4px] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
