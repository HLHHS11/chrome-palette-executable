import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { timeAgo } from "@pages/lib/time-ago";
import type { Memo, OrphanMemo } from "@pages/memo";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../util/favicon";

/** 宙に浮いたメモ (セッション復元でタブを決めきれなかったもの) の後始末。 */
export const MEMO_ORPHAN_KEYWORD = "mo";

const callBackgroundRpc = createRuntimeRpcClient<typeof backgroundRoutes>();

async function currentTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (tab?.id === undefined) throw new Error("Could not get active tab.");
  return tab.id;
}

/**
 * このタブが引き継げる、宙に浮いたメモの一覧。
 *
 * URL が同じタブが複数あるとき、`@core/tab-bound-store` はあえて推測せずに
 * 結合を諦める。その行き場を与えるのがこのコマンド群。
 *
 * 現在のタブと同じ URL のものだけが返る。別のページで書いたメモを
 * ここへ引き継ぐことはまず無く、全部並べると実際に選びたいものが埋もれる。
 */
const orphans = createLazyResource<OrphanMemo[]>([], async () => {
  const response = await callBackgroundRpc({
    name: "memo.listOrphans",
    tabId: await currentTabId(),
  });
  if (!response.ok || !("data" in response)) return [];
  return response.data.orphans;
});

/** 復元先のタブが今持っているメモ。押し出しの有無を伝えるために読む。 */
const currentMemo = createLazyResource<Memo | null>(null, async () => {
  const response = await callBackgroundRpc({
    name: "memo.get",
    tabId: await currentTabId(),
  });
  if (!response.ok || !("data" in response)) return null;
  return response.data.memo;
});

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
    window.close();
  } catch (e: unknown) {
    setInput(`エラーが発生しました。詳細: ${e}`);
  }
}

/**
 * メモを編集できる状態にして、そこへカーソルを移す。
 *
 * 本文の入力欄をパレットのポップアップに置く意味はない。ポップアップは
 * 用が済めば閉じるものなので、書く場所はページ上のメモそのものが自然。
 * メモが無ければ空のまま作って、そこにカーソルを置く。
 */
async function editMemo(): Promise<void> {
  const response = await callBackgroundRpc({
    name: "memo.edit",
    tabId: await currentTabId(),
  });
  if (!response.ok) throw new Error(response.error);
}

async function removeMemo(): Promise<void> {
  const response = await callBackgroundRpc({
    name: "memo.remove",
    tabId: await currentTabId(),
  });
  if (!response.ok) throw new Error(response.error);
}

async function toggleSize(): Promise<void> {
  const response = await callBackgroundRpc({
    name: "memo.toggleSize",
    tabId: await currentTabId(),
  });
  if (!response.ok) throw new Error(response.error);
}

async function adoptOrphan(recordId: string): Promise<void> {
  const response = await callBackgroundRpc({
    name: "memo.adoptOrphan",
    recordId,
    tabId: await currentTabId(),
  });
  if (!response.ok) throw new Error(response.error);
}

async function forgetOrphan(recordId: string): Promise<void> {
  const response = await callBackgroundRpc({
    name: "memo.forgetOrphan",
    recordId,
  });
  if (!response.ok) throw new Error(response.error);
}

/**
 * 1 件につき「復元する」「破棄する」の 2 行を出す。
 * どちらも取り返しの付き方が違うので、Enter 一発の意味を曖昧にしたくない。
 *
 * 本文は網掛けの行に出るので、題名では繰り返さない。
 */
function orphanCommands(): Command[] {
  const list = orphans();
  if (list.length === 0) {
    return [
      {
        title: "復元できるメモはありません",
        icon: faviconURL("about:blank"),
      },
    ];
  }

  // 復元先に既にメモがあると、そちらが押し出されて一覧に戻る。
  // 消えはしないが黙って画面から消えるので、行の時点で断っておく。
  const displaced = currentMemo()?.text;

  return list.flatMap((orphan): Command[] => {
    const origin = `${orphan.title || orphan.url} · ${timeAgo(orphan.updatedAt)}`;
    return [
      {
        title: "復元する",
        subtitle: displaced ? `${origin} · 今のメモは一覧に戻る` : origin,
        memo: orphan.text,
        icon: faviconURL(orphan.url),
        handler: () => void run(() => adoptOrphan(orphan.recordId)),
      },
      {
        title: "破棄する",
        subtitle: origin,
        memo: orphan.text,
        icon: faviconURL(orphan.url),
        handler: () => void run(() => forgetOrphan(orphan.recordId)),
      },
    ];
  });
}

const entryCommands: Command[] = [
  {
    title: "Memo: Edit Memo",
    subtitle: "メモを編集する",
    icon: faviconURL("about:blank"),
    handler: () => void run(editMemo),
  },
  {
    title: "Memo: Toggle Memo Size",
    subtitle: "メモの大きさを切り替える",
    icon: faviconURL("about:blank"),
    handler: () => void run(toggleSize),
  },
  {
    title: "Memo: Remove Memo",
    subtitle: "メモを削除する",
    icon: faviconURL("about:blank"),
    handler: () => void run(removeMemo),
  },
];

/**
 * 孤児が 0 件のときは入口ごと隠す。
 * 普段は存在しない状態なので、常設すると意味のない 1 行が居座り続ける。
 */
function orphanEntryCommands(): Command[] {
  const count = orphans().length;
  if (count === 0) return [];
  return [
    {
      title: `Memo: Restore Memo (${count})`,
      subtitle: "メモを復元する",
      keyword: `${MEMO_ORPHAN_KEYWORD}>`,
      icon: faviconURL("about:blank"),
      handler: () => setInput(`${MEMO_ORPHAN_KEYWORD}>`),
    },
  ];
}

export default function memoSuggestions(): Command[] {
  const { isMatch, isCommand } = matchCommand(MEMO_ORPHAN_KEYWORD);
  if (isMatch) return orphanCommands();
  if (isCommand) return [];
  return [...entryCommands, ...orphanEntryCommands()];
}
