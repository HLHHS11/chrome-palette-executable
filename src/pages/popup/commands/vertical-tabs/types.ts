import type { DuplicateHighlightColor } from "@core/command";

export type VerticalTabItem = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  faviconUrl: string | undefined;
  shortcutNumber: number | null;
  duplicateHighlightColor: DuplicateHighlightColor | null;
  /** タブが最後にアクティブだった時刻 (ms epoch)。相対時刻表示用。取得不能時は undefined。 */
  lastAccessed?: number;
};
