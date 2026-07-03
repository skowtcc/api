import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/shallow";

export type ViewMode = "grid" | "list";

interface Settings {
  showSuggestiveContent: boolean;
  useGameAbbreviations: boolean;
  enableHaptics: boolean;
  viewMode: ViewMode;
}

interface SettingsStore extends Settings {
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  toggleSetting: (key: keyof Settings) => void;
}

const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      showSuggestiveContent: false,
      useGameAbbreviations: false,
      enableHaptics: true,
      viewMode: "grid" as ViewMode,

      updateSetting: (key, value) => set({ [key]: value }),

      toggleSetting: (key) =>
        set((state) => {
          const current = state[key];
          if (typeof current === "boolean") return { [key]: !current };
          return {};
        }),
    }),
    { name: "skowt-settings" },
  ),
);

export function useSettings() {
  const settings = useSettingsStore(
    useShallow((s) => ({
      showSuggestiveContent: s.showSuggestiveContent,
      useGameAbbreviations: s.useGameAbbreviations,
      enableHaptics: s.enableHaptics,
      viewMode: s.viewMode,
    })),
  );
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const toggleSetting = useSettingsStore((s) => s.toggleSetting);

  return { settings, updateSetting, toggleSetting };
}
