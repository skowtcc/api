import { type ComponentType } from "react";
import {
  IconFilePngFill24,
  IconFileJpgFill24,
  IconFileGifFill24,
  IconFileSvgFill24,
  IconFileWebpFill24,
  IconFileBmpFill24,
  IconFilePsdFill24,
  IconFileTifFill24,
  IconFilePdfFill24,
  IconFileZipFill24,
  IconFileRarFill24,
  IconFileFill24,
} from "nucleo-core-fill-24";
import { cn } from "@/lib/utils";
import { softChipStyle } from "@/lib/chip";

type FormatMeta = {
  icon: ComponentType<{ className?: string }>;
  color: string;
};

// muted violet-grey for anything we don't have a colour for
const FALLBACK: FormatMeta = { icon: IconFileFill24, color: "oklch(0.78 0.03 285)" };

/* pastel oklch in the same lightness band as the homepage stat chips, so the
   whole site speaks one colour language. colour carries the file type - png is
   always blue, gif always pink - so the eye learns the format at a glance */
const FORMATS: Record<string, FormatMeta> = {
  png: { icon: IconFilePngFill24, color: "oklch(0.80 0.10 235)" }, // blue
  jpg: { icon: IconFileJpgFill24, color: "oklch(0.84 0.10 70)" }, // amber
  jpeg: { icon: IconFileJpgFill24, color: "oklch(0.84 0.10 70)" },
  gif: { icon: IconFileGifFill24, color: "oklch(0.80 0.11 350)" }, // pink
  svg: { icon: IconFileSvgFill24, color: "oklch(0.80 0.11 290)" }, // violet
  webp: { icon: IconFileWebpFill24, color: "oklch(0.83 0.09 195)" }, // teal
  bmp: { icon: IconFileBmpFill24, color: "oklch(0.82 0.08 220)" }, // steel
  psd: { icon: IconFilePsdFill24, color: "oklch(0.78 0.10 255)" }, // photoshop blue
  tif: { icon: IconFileTifFill24, color: "oklch(0.83 0.09 165)" }, // green-teal
  tiff: { icon: IconFileTifFill24, color: "oklch(0.83 0.09 165)" },
  pdf: { icon: IconFilePdfFill24, color: "oklch(0.74 0.13 25)" }, // red
  zip: { icon: IconFileZipFill24, color: "oklch(0.85 0.10 95)" }, // yellow
  rar: { icon: IconFileRarFill24, color: "oklch(0.85 0.10 95)" },
};

function getFormat(extension: string): FormatMeta {
  return FORMATS[extension.toLowerCase()] ?? FALLBACK;
}

interface FormatChipProps {
  extension: string;
  /**
   * `solid` - translucent pastel fill + label, for calm dark surfaces (asset detail).
   * `inline` - bare coloured icon + code, no fill, for dense meta rows (list view).
   */
  variant?: "solid" | "inline";
  className?: string;
}

export function FormatChip({ extension, variant = "solid", className }: FormatChipProps) {
  const { icon: Icon, color } = getFormat(extension);
  const label = extension.toUpperCase();

  if (variant === "inline") {
    return (
      <span
        className={cn("inline-flex items-center gap-1 font-semibold", className)}
        style={{ color }}
      >
        <Icon className="size-3.5 shrink-0" />
        {label}
      </span>
    );
  }

  /* icon-only: the lettered file glyph already spells the format, so no text
     label (it would just duplicate). sized to sit in a chip row beside tags */
  return (
    <span
      className={cn(
        // icon-only, so give it generous horizontal breathing room
        "inline-flex items-center justify-center h-6 px-3 rounded-full",
        className,
      )}
      style={softChipStyle(color)}
      title={label}
    >
      <Icon className="size-4" />
    </span>
  );
}
