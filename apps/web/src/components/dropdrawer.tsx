import { motion } from "motion/react";
import * as React from "react";
import useMeasure from "react-use-measure";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const DropDrawerContext = React.createContext<{ isMobile: boolean } | undefined>(undefined);

const useDropDrawerContext = () => {
  const context = React.useContext(DropDrawerContext);
  if (!context) {
    throw new Error("DropDrawer components cannot be rendered outside the DropDrawer Context");
  }
  return context;
};

function DropDrawer({
  children,
  ...props
}: React.ComponentProps<typeof Drawer> | React.ComponentProps<typeof DropdownMenu>) {
  const isMobile = useIsMobile();
  const DropdownComponent = isMobile ? Drawer : DropdownMenu;

  return (
    <DropDrawerContext.Provider value={{ isMobile }}>
      <DropdownComponent
        data-slot="drop-drawer"
        {...(isMobile && { autoFocus: true })}
        {...(!isMobile && { modal: false })}
        {...props}
      >
        {children}
      </DropdownComponent>
    </DropDrawerContext.Provider>
  );
}

function DropDrawerTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerTrigger> | React.ComponentProps<typeof DropdownMenuTrigger>) {
  const { isMobile } = useDropDrawerContext();
  const TriggerComponent = isMobile ? DrawerTrigger : DropdownMenuTrigger;

  return (
    <TriggerComponent data-slot="drop-drawer-trigger" className={className} {...props}>
      {children}
    </TriggerComponent>
  );
}

function DropDrawerContent({
  className,
  children,
  align = "end",
  ...props
}:
  | (React.ComponentProps<typeof DrawerContent> & { align?: "start" | "center" | "end" })
  | React.ComponentProps<typeof DropdownMenuContent>) {
  const { isMobile } = useDropDrawerContext();
  const [measureRef, bounds] = useMeasure();

  if (isMobile) {
    return (
      <DrawerContent
        data-slot="drop-drawer-content"
        className={cn("max-h-[90vh]", className)}
        {...props}
      >
        <DrawerHeader className="sr-only">
          <DrawerTitle>Menu</DrawerTitle>
        </DrawerHeader>
        <motion.div
          animate={{ height: bounds.height > 0 ? bounds.height : "auto" }}
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
          className="overflow-hidden"
        >
          <div ref={measureRef} className="overflow-y-auto max-h-[70vh]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="pb-6 space-y-1.5 w-full"
            >
              {children}
            </motion.div>
          </div>
        </motion.div>
      </DrawerContent>
    );
  }

  return (
    <DropdownMenuContent
      data-slot="drop-drawer-content"
      align={align}
      sideOffset={4}
      className={cn(
        "max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[220px] overflow-y-auto",
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  );
}

function DropDrawerItem({
  className,
  children,
  onSelect,
  onClick,
  icon,
  variant = "default",
  inset,
  disabled,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  icon?: React.ReactNode;
}) {
  const { isMobile } = useDropDrawerContext();
  const hapticPattern = variant === "destructive" ? "warning" : "selection";

  const isInGroup = React.useCallback((element: HTMLElement | null): boolean => {
    if (!element) return false;

    let parent = element.parentElement;
    while (parent) {
      if (parent.hasAttribute("data-drop-drawer-group")) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  }, []);

  const itemRef = React.useRef<HTMLDivElement>(null);
  const [isInsideGroup, setIsInsideGroup] = React.useState(false);

  React.useEffect(() => {
    if (!isMobile) return;

    const timer = setTimeout(() => {
      if (itemRef.current) {
        setIsInsideGroup(isInGroup(itemRef.current));
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isInGroup, isMobile]);

  if (isMobile) {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (onClick) onClick(e);
      if (onSelect) onSelect(e as unknown as Event);
    };

    const content = (
      <div
        ref={itemRef}
        data-slot="drop-drawer-item"
        data-variant={variant}
        data-inset={inset}
        data-disabled={disabled}
        data-haptic={hapticPattern}
        className={cn(
          "flex cursor-pointer items-center justify-between px-4 py-4",
          !isInsideGroup &&
            "bg-foreground/[0.05] active:bg-foreground/[0.08] mx-3 my-1.5 rounded-xl",
          isInsideGroup && "bg-transparent py-4 active:bg-foreground/5",
          inset && "pl-8",
          variant === "destructive" &&
            "text-destructive dark:text-destructive active:bg-destructive/10",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        onClick={handleClick}
        aria-disabled={disabled}
        {...props}
      >
        <div className="flex items-center gap-2">{children}</div>
        {icon && <div className="flex-shrink-0">{icon}</div>}
      </div>
    );

    return <DrawerClose asChild>{content}</DrawerClose>;
  }

  return (
    <DropdownMenuItem
      data-slot="drop-drawer-item"
      data-variant={variant}
      data-inset={inset}
      data-haptic={hapticPattern}
      className={className}
      onSelect={onSelect}
      onClick={onClick as React.MouseEventHandler<HTMLDivElement>}
      variant={variant}
      inset={inset}
      disabled={disabled}
      {...props}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">{children}</div>
        {icon && <div>{icon}</div>}
      </div>
    </DropdownMenuItem>
  );
}

function DropDrawerSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuSeparator>) {
  const { isMobile } = useDropDrawerContext();

  if (isMobile) {
    return null;
  }

  return (
    <DropdownMenuSeparator data-slot="drop-drawer-separator" className={className} {...props} />
  );
}

function DropDrawerGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  children: React.ReactNode;
}) {
  const { isMobile } = useDropDrawerContext();

  const childrenWithSeparators = React.useMemo(() => {
    if (!isMobile) return children;

    const childArray = React.Children.toArray(children);

    const filteredChildren = childArray.filter(
      (child) => React.isValidElement(child) && child.type !== DropDrawerSeparator,
    );

    return filteredChildren.flatMap((child, index) => {
      if (index === filteredChildren.length - 1) return [child];
      return [
        child,
        <div
          key={`separator-${index}`}
          className="h-px [background:linear-gradient(to_right,transparent,oklch(0_0_0/0.35)_15%,oklch(0_0_0/0.35)_85%,transparent)] [box-shadow:0_1px_0_0_oklch(1_0_0/0.04)]"
          aria-hidden="true"
        />,
      ];
    });
  }, [children, isMobile]);

  if (isMobile) {
    return (
      <div
        data-drop-drawer-group
        data-slot="drop-drawer-group"
        role="group"
        className={cn("bg-foreground/[0.05] mx-3 my-3 overflow-hidden rounded-xl", className)}
        {...props}
      >
        {childrenWithSeparators}
      </div>
    );
  }

  return (
    <div
      data-drop-drawer-group
      data-slot="drop-drawer-group"
      role="group"
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}

export {
  DropDrawer,
  DropDrawerContent,
  DropDrawerGroup,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerTrigger,
};
