import { create } from "zustand";

/**
 * Open/closed state for the AI chat drawer. It lives in its own tiny store —
 * separate from the goals store — because the trigger (in the Topbar) and the
 * drawer (mounted once in the app layout) are far apart in the tree and the
 * Topbar remounts on navigation, so local `useState` can't hold it. Kept in
 * `lib/` (shared) so both a shared component and the chat feature can read it
 * without a layer inversion.
 */
type ChatUiState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useChatUi = create<ChatUiState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
