import type { CSSProperties } from "react";

/**
 * the translucent pastel-chip look from the homepage stat band: one colour
 * carries both the glowing text and a soft gradient fill. depth comes from the
 * colour, never a border. pass any oklch/hex colour and spread onto an element.
 *
 *   <span style={softChipStyle("oklch(0.82 0.10 285)")}>…</span>
 */
export function softChipStyle(color: string): CSSProperties {
  return {
    color,
    /*
     * mixed against the background token (NOT transparent) so chips are fully
     * opaque: same perceived colour as the old alpha fill on the plain page,
     * but backdrop art (hero banner covers) can never bleed through and shift it
     */
    background: `linear-gradient(180deg, color-mix(in oklch, ${color} 22%, var(--background)) 0%, color-mix(in oklch, ${color} 13%, var(--background)) 100%)`,
  };
}

/**
 * flat (single-colour) translucent chip fill - the calmer sibling of softChipStyle.
 * used by metadata badges (file size, version) and tags. `pct` is the fill opacity.
 */
export function flatChipStyle(color: string, pct = 16): CSSProperties {
  return {
    color,
    background: `color-mix(in oklch, ${color} ${pct}%, var(--background))`,
  };
}

/** the site's violet accent, in the same pastel band as the stat chips. used as
 *  the default "active / selected" tint where the thing has no colour of its own. */
export const ACCENT_CHIP_COLOR = "var(--chip-violet)";
