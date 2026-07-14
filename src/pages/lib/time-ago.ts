import twas from "twas";

/**
 * twas の相対時刻表示を流用しつつ、単数を "a/an" ではなく "1" で見せる
 * ("an hour ago" → "1 hour ago")。数字に揃えた方がどちらが新しいか比較しやすいため。
 */
export function timeAgo(ms: number): string {
  return twas(ms).replace(/^an? /, "1 ");
}
