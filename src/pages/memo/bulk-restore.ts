import type {
  RematchCandidate,
  TabBoundRecord,
  TabBoundRecordId,
} from "@core/tab-bound-store";

import type { Memo } from "./types";

/**
 * 外れた時刻の間隔がこれ以内なら、まとめて閉じたものとみなす。
 * ウィンドウごと閉じれば 1 秒も空かないが、Cmd+W で順に閉じると数秒ずつ空く。
 */
const CLOSED_TOGETHER_GAP_MS = 30 * 1000;

/**
 * 一括復元で、どの孤児をどのタブに結びつけるかを決める。
 *
 * 対象は「直近にまとめて閉じたメモ」だけ。古いものまで戻すと、用が済んで
 * 閉じたメモまで同じ URL のタブに貼り付いてしまう。いま開いているタブに
 * 行き先が無い孤児は、まとまりを測るときにも数えない。数えると、行き場の
 * 無いメモがいつまでも「一番新しいまとまり」として居座り、その前に閉じた
 * まとまりへ手が届かなくなる。
 *
 * 同じ URL のタブが複数あれば、元の位置順に空いているタブへ割り当てる。
 * URL が同じなら同じページなので、どれに付いても実害は小さい。
 *
 * @param freeTabs メモを持っていないタブ。メモがあるタブには割り当てない。
 */
export function planBulkRestore(
  orphans: readonly TabBoundRecord<Memo>[],
  freeTabs: readonly RematchCandidate[]
): Map<TabBoundRecordId, number> {
  const tabsByUrl = new Map<string, RematchCandidate[]>();
  for (const tab of freeTabs) {
    const bucket = tabsByUrl.get(tab.binding.url);
    if (bucket) bucket.push(tab);
    else tabsByUrl.set(tab.binding.url, [tab]);
  }

  const restorable = orphans
    .filter(
      (record): record is TabBoundRecord<Memo> & { detachedAt: number } =>
        record.value.text.length > 0 &&
        record.detachedAt !== undefined &&
        tabsByUrl.has(record.binding.url)
    )
    .sort((a, b) => b.detachedAt - a.detachedAt);

  // 新しい順にたどり、前のメモとの間隔が空いたところで打ち切る。
  const breakAt = restorable.findIndex(
    (record, i) =>
      i > 0 &&
      restorable[i - 1].detachedAt - record.detachedAt > CLOSED_TOGETHER_GAP_MS
  );
  const group = breakAt < 0 ? restorable : restorable.slice(0, breakAt);

  const plan = new Map<TabBoundRecordId, number>();
  const byIndex = (a: { binding: { index: number } }, b: typeof a) =>
    a.binding.index - b.binding.index;
  for (const [url, tabs] of tabsByUrl) {
    const memos = group.filter((record) => record.binding.url === url);
    const sortedTabs = [...tabs].sort(byIndex);
    [...memos].sort(byIndex).forEach((record, i) => {
      if (i < sortedTabs.length) plan.set(record.id, sortedTabs[i].tabId);
    });
  }
  return plan;
}
