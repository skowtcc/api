import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SelectedAsset {
  id: string;
  name: string;
  url: string;
  gameName: string;
  categoryName: string;
  extension: string;
}

interface SelectionState {
  isSelectMode: boolean;

  // selection data (record for JSON serialisation)
  selectedAssets: Record<string, SelectedAsset>;

  toggleSelectMode: () => void;
  setSelectMode: (enabled: boolean) => void;

  selectAsset: (asset: SelectedAsset) => boolean; // returns false if at limit
  deselectAsset: (assetId: string) => void;
  toggleAsset: (asset: SelectedAsset) => boolean;

  clearSelection: () => void;
  isSelected: (assetId: string) => boolean;

  getSelectedCount: () => number;
  getRemainingSlots: () => number;
  isAtLimit: () => boolean;
  getSelectedArray: () => SelectedAsset[];
}

export const MAX_SELECTION = 350;
export const WARNING_THRESHOLD = 315;

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set, get) => ({
      isSelectMode: false,
      selectedAssets: {},

      toggleSelectMode: () =>
        set((state) => ({
          isSelectMode: !state.isSelectMode,
        })),

      setSelectMode: (enabled) => set({ isSelectMode: enabled }),

      selectAsset: (asset) => {
        const state = get();
        const count = Object.keys(state.selectedAssets).length;
        if (count >= MAX_SELECTION) {
          return false;
        }
        set((state) => ({
          selectedAssets: {
            ...state.selectedAssets,
            [asset.id]: asset,
          },
        }));
        return true;
      },

      deselectAsset: (assetId) =>
        set((state) => {
          const { [assetId]: _, ...rest } = state.selectedAssets;
          return { selectedAssets: rest };
        }),

      toggleAsset: (asset) => {
        const state = get();
        if (state.selectedAssets[asset.id]) {
          state.deselectAsset(asset.id);
          return true;
        }
        return state.selectAsset(asset);
      },

      clearSelection: () => set({ selectedAssets: {} }),

      isSelected: (assetId) => !!get().selectedAssets[assetId],

      getSelectedCount: () => Object.keys(get().selectedAssets).length,
      getRemainingSlots: () => MAX_SELECTION - Object.keys(get().selectedAssets).length,
      isAtLimit: () => Object.keys(get().selectedAssets).length >= MAX_SELECTION,
      getSelectedArray: () => Object.values(get().selectedAssets),
    }),
    {
      name: "skowt-selection",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// cross-tab sync: listen for storage events and rehydrate
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "skowt-selection") {
      useSelectionStore.persist.rehydrate();
    }
  });
}
