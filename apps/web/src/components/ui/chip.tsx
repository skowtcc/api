import { type ReactNode } from "react";
import { softChipStyle, flatChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import { cn } from "@/lib/utils";

interface ChipProps {
  /** any colour string or CSS var; defaults to the accent violet token */
  tone?: string;
  /** override just the text colour (when text and fill use different tones) */
  textTone?: string;
  /** soft = gradient fill (default), flat = single-colour fill */
  fill?: "soft" | "flat";
  /** flat-fill opacity %; ignored when fill="soft" */
  flatPct?: number;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Non-interactive translucent badge. For buttons, use softChipStyle() directly. */
export function Chip({
  tone = ACCENT_CHIP_COLOR,
  textTone,
  fill = "soft",
  flatPct = 16,
  icon,
  className,
  children,
}: ChipProps) {
  const style = {
    ...(fill === "flat" ? flatChipStyle(tone, flatPct) : softChipStyle(tone)),
    ...(textTone ? { color: textTone } : {}),
  };
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
