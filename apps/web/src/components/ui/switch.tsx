"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Switch as SwitchPrimitive } from "radix-ui";

const SwitchContext = React.createContext<{ permanent: boolean } | undefined>(undefined);

const useSwitchContext = () => React.useContext(SwitchContext);

const switchVariants = cva(
  `
    surface-well relative peer inline-flex shrink-0 cursor-pointer items-center rounded-full
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze-top
    disabled:cursor-not-allowed disabled:opacity-50
    aria-invalid:outline-2 aria-invalid:outline-offset-1 aria-invalid:outline-destructive
  `,
  {
    variants: {
      shape: {
        pill: "rounded-full",
        square: "rounded-md",
      },
      size: {
        sm: "h-5 w-8",
        md: "h-6 w-10",
        lg: "h-8 w-14",
        xl: "h-9 w-16",
      },
      permanent: {
        true: "",
        false: "data-[state=checked]:surface-accent-solid",
      },
    },
    defaultVariants: {
      shape: "pill",
      permanent: false,
      size: "md",
    },
  },
);

const switchThumbVariants = cva(
  "pointer-events-none block w-1/2 h-[calc(100%-4px)] ring-0 transition-transform start-0 data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[calc(100%-2px)] rtl:data-[state=unchecked]:-translate-x-[2px] rtl:data-[state=checked]:-translate-x-[calc(100%-2px)] bg-linear-to-b from-[oklch(0.92_0.005_70)] to-[oklch(0.74_0.005_70)] [box-shadow:inset_0_1px_0_0_oklch(1_0_0/0.4),inset_0_-1px_0_0_oklch(0_0_0/0.25),inset_0_0_0_1px_oklch(0_0_0/0.35),0_1px_2px_0_oklch(0_0_0/0.4)]",
  {
    variants: {
      shape: {
        pill: "rounded-full",
        square: "rounded-md",
      },
      size: {
        xs: "",
        sm: "",
        md: "",
        lg: "",
        xl: "",
      },
    },
    compoundVariants: [
      {
        shape: "square",
        size: "xs",
        className: "rounded-sm",
      },
    ],
    defaultVariants: {
      shape: "pill",
      size: "md",
    },
  },
);

const switchIndicatorVariants = cva(
  "text-sm font-medium absolute mx-[2px] top-1/2 w-1/2 -translate-y-1/2 flex pointer-events-none items-center justify-center text-center transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
  {
    variants: {
      state: {
        on: "start-0",
        off: "end-0",
      },
      permanent: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        state: "on",
        permanent: false,
        className:
          "text-primary-foreground peer-data-[state=unchecked]:invisible peer-data-[state=unchecked]:translate-x-full rtl:peer-data-[state=unchecked]:-translate-x-full",
      },
      {
        state: "off",
        permanent: false,
        className:
          "peer-data-[state=checked]:invisible -translate-x-full rtl:translate-x-full peer-data-[state=unchecked]:translate-x-0",
      },
      {
        state: "on",
        permanent: true,
        className: "start-0",
      },
      {
        state: "off",
        permanent: true,
        className: "end-0",
      },
    ],
    defaultVariants: {
      state: "off",
      permanent: false,
    },
  },
);

function SwitchWrapper({
  className,
  children,
  permanent = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { permanent?: boolean }) {
  return (
    <SwitchContext.Provider value={{ permanent }}>
      <div
        data-slot="switch-wrapper"
        className={cn("relative inline-flex items-center", className)}
        {...props}
      >
        {children}
      </div>
    </SwitchContext.Provider>
  );
}

function Switch({
  className,
  thumbClassName = "",
  shape,
  size,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> &
  VariantProps<typeof switchVariants> & { thumbClassName?: string }) {
  const context = useSwitchContext();
  const permanent = context?.permanent ?? false;

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-haptic="light"
      className={cn(switchVariants({ shape, size, permanent }), className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className={cn(switchThumbVariants({ shape, size }), thumbClassName)} />
    </SwitchPrimitive.Root>
  );
}

function SwitchIndicator({
  className,
  state,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof switchIndicatorVariants>) {
  const context = useSwitchContext();
  const permanent = context?.permanent ?? false;

  return (
    <span
      data-slot="switch-indicator"
      className={cn(switchIndicatorVariants({ state, permanent }), className)}
      {...props}
    />
  );
}

export { Switch, SwitchIndicator, SwitchWrapper };
