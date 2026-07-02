export type VerticalTabDuplicateColor = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type VerticalTabItem = {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  faviconUrl: string | undefined;
  shortcutNumber: number | null;
  duplicateColor: VerticalTabDuplicateColor | null;
};
