import type { DuplicateHighlightColor } from "@core/command";
import type { MemoColor } from "@pages/memo";

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
  /** そのタブに貼り付けられたメモ本文。未設定なら undefined。 */
  memo?: string;
  /** メモがあるときの色。memo が無いときは無視する。 */
  memoColor?: MemoColor;
};
