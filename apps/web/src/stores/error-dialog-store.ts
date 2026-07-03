import { create } from "zustand";

export type ErrorType = "discord" | "rate_limit";

interface ErrorDialogState {
  isOpen: boolean;
  errorType: ErrorType | null;
  open: (errorType: ErrorType) => void;
  close: () => void;
}

export const useErrorDialogStore = create<ErrorDialogState>((set) => ({
  isOpen: false,
  errorType: null,
  open: (errorType) => set({ isOpen: true, errorType }),
  close: () => set({ isOpen: false, errorType: null }),
}));
