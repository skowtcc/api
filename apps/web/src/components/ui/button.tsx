import * as React from "react";
import { Slot as SlotPrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn, mutedControl } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-top aria-invalid:outline-2 aria-invalid:outline-offset-1 aria-invalid:outline-destructive",
  {
    variants: {
      variant: {
        default: "surface-accent-soft-pressable",
        discord: "surface-discord-soft-pressable",
        destructive:
          "text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive/15 hover:border-destructive/35 active:bg-destructive/20 transition-colors",
        outline: mutedControl,
        secondary: mutedControl,
        ghost:
          "text-foreground hover:bg-foreground/6 active:bg-foreground/10 active:translate-y-px transition-transform duration-75 disabled:opacity-50",
        link: "text-foreground underline underline-offset-4 decoration-1 hover:decoration-2 disabled:opacity-50",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
