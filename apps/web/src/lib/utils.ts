import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** calm secondary control surface: raised, muted text. single source for sort/filter/view/vote buttons */
export const mutedControl = "surface-raised-pressable text-muted-foreground";
