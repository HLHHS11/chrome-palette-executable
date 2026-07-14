import type { DuplicateHighlightColor } from "@core/command";

export type VerticalTabItem = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  faviconUrl: string | undefined;
  shortcutNumber: number | null;
  duplicateHighlightColor: DuplicateHighlightColor | null;
};
