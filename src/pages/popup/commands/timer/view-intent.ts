import type { DurationFields } from "@pages/timer";
import { createSignal } from "solid-js";

/**
 * 一覧で何をしに来たか。同じ行の並びでも、Enter に載せる操作が変わる。
 */
export type TimerListAction = "manage" | "stop";

/**
 * パレットの画面全体を使うタイマーの表示。どれも開いていない間は null。
 *
 * 一覧と詳細設定はどちらも矢印キーや複数の入力欄で操作するものであり、
 * 候補行の絞り込みでは扱えない。よってコマンドから直接この表示を開く。
 */
export type TimerView =
  | { kind: "form"; fields: DurationFields }
  | { kind: "list"; action: TimerListAction };

const [timerView, setTimerView] = createSignal<TimerView | null>(null);

export { timerView };

export function openTimerForm(fields: DurationFields): void {
  setTimerView({ kind: "form", fields });
}

export function openTimerList(action: TimerListAction): void {
  setTimerView({ kind: "list", action });
}

export function closeTimerView(): void {
  setTimerView(null);
}

export const EMPTY_DURATION_FIELDS: DurationFields = {
  hours: "",
  minutes: "",
  seconds: "",
};
