import type { CSSProperties } from "react";

/* < 1k → plain; ≥ 1k → K/M/B floored to 1 decimal with a "+" (so the real value
   is always ≥ shown). trailing ".0" is dropped: 300,000 → "300K+", 2,000,000 → "2M+" */
export const fmt = (n: number | undefined): string => {
  if (n == null) return "-";
  if (n < 1000) return n.toLocaleString();
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [div, suffix] of units) {
    if (n >= div) {
      const v = Math.floor((n / div) * 10) / 10;
      const str = v % 1 === 0 ? String(v) : v.toFixed(1);
      return `${str}${suffix}+`;
    }
  }
  return n.toLocaleString();
};

export const STATS = [
  { key: "assets" as const, label: "assets", color: "oklch(0.82 0.10 285)" },
  { key: "games" as const, label: "games", color: "var(--chip-violet)" },
  { key: "downloads" as const, label: "downloads", color: "oklch(0.86 0.09 82)" },
  { key: "views" as const, label: "views", color: "oklch(0.83 0.09 235)" },
];

export function GamepadGlyph({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden
    >
      <line x1="6" x2="10" y1="11" y2="11" />
      <line x1="8" x2="8" y1="9" y2="13" />
      <line x1="15" x2="15.01" y1="12" y2="12" />
      <line x1="18" x2="18.01" y1="10" y2="10" />
      <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
    </svg>
  );
}
