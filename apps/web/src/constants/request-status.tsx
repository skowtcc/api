import type { ComponentType } from "react";
import {
  IconCircleDotted,
  IconProgressCircle2Of4,
  IconCircleCheckFilled,
  IconCircleXmark,
} from "nucleo-micro-bold";
import type { RequestStatus } from "@/types/requests";

interface StatusConfig {
  label: string;
  icon: ComponentType<{ className?: string }>;
  className: string;
  /** pastel oklch in the stat-chip band - drives the translucent active-filter chip */
  color: string;
}

export const requestStatusConfig: Record<RequestStatus, StatusConfig> = {
  open: {
    label: "Open",
    icon: IconCircleDotted,
    className: "text-muted-foreground",
    color: "oklch(0.78 0.03 285)", // neutral
  },
  in_progress: {
    label: "In Progress",
    icon: IconProgressCircle2Of4,
    className: "text-bronze-face",
    color: "oklch(0.8 0.11 285)", // violet
  },
  completed: {
    label: "Completed",
    icon: IconCircleCheckFilled,
    className: "text-role-contrib",
    color: "oklch(0.82 0.1 162)", // green
  },
  rejected: {
    label: "Closed",
    icon: IconCircleXmark,
    /* same muted red as `color` below - the icon carries its tone at rest,
       matching in_progress/completed (not only on hover/active) */
    className: "text-[oklch(0.74_0.1_25)]",
    color: "oklch(0.74 0.1 25)", // muted red
  },
};
