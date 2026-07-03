import type { HapticPattern, TriggerOptions } from "web-haptics";

export interface HapticDefinition {
  pattern: HapticPattern;
  options?: TriggerOptions;
}

export const HAPTIC = {
  SUCCESS: {
    pattern: [{ duration: 30 }, { delay: 60, duration: 40, intensity: 1 }],
  },
  WARNING: {
    pattern: [
      { duration: 40, intensity: 0.8 },
      { delay: 100, duration: 40, intensity: 0.6 },
    ],
  },
  ERROR: {
    pattern: [
      { duration: 40, intensity: 0.8 },
      { delay: 100, duration: 40, intensity: 0.6 },
    ],
  },
  LIGHT_ACTION: {
    pattern: [{ duration: 15 }],
    options: { intensity: 0.4 },
  },
  ACTION: {
    pattern: [{ duration: 40 }],
  },
} as const satisfies Record<string, HapticDefinition>;

const DATA_HAPTIC_MAP: Record<string, HapticDefinition> = {
  success: HAPTIC.SUCCESS,
  warning: HAPTIC.WARNING,
  error: HAPTIC.ERROR,
  light: HAPTIC.LIGHT_ACTION,
  action: HAPTIC.ACTION,
  selection: HAPTIC.ACTION,
};

export function isHapticInputDisabled(value: string | null): boolean {
  return value?.trim().toLowerCase() === "off";
}

export function resolveHapticFromDataAttr(value: string | null): HapticDefinition {
  if (!value) return HAPTIC.ACTION;
  const normalized = value.trim().toLowerCase();
  return DATA_HAPTIC_MAP[normalized] ?? HAPTIC.ACTION;
}
