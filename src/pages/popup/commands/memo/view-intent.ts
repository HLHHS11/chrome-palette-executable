import type { MemoColor } from "@pages/memo";
import { createSignal } from "solid-js";

/**
 * メモ色ピッカー用の画面切替。開いていない間は null。
 *
 * 5 色から矢印キーで選ぶ操作は候補行の絞り込みでは扱えないので、
 * コマンドから直接この表示を開く。
 */
const [memoColorPicker, setMemoColorPicker] = createSignal<{
  initialColor: MemoColor | null;
} | null>(null);

export { memoColorPicker };

export function openMemoColorPicker(initialColor: MemoColor | null): void {
  setMemoColorPicker({ initialColor });
}

export function closeMemoColorPicker(): void {
  setMemoColorPicker(null);
}
