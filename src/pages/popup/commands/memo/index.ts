import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { timeAgo } from "@pages/lib/time-ago";
import type { OrphanMemo } from "@pages/memo";

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

/** 一覧の 1 行に収まるように、改行を潰して先頭だけ見せる。 */
function previewOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
}

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
    window.close();
  } catch (e: unknown) {
    setInput(`エラーが発生しました。詳細: ${e}`);
  }
}

/**
 * 付箋を編集できる状態にして、そこへカーソルを移す。
 *
 * 本文の入力欄をパレットのポップアップに置く意味はない。ポップアップは
 * 用が済めば閉じるものなので、書く場所はページ上の付箋そのものが自然。
 * 付箋が無ければ空のまま作って、そこにカーソルを置く。
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
 * 孤児 1 件につき「引き継ぐ」「破棄する」の 2 行を出す。
 * どちらも取り返しの付き方が違うので、Enter 一発の意味を曖昧にしたくない。
 */
function orphanCommands(): Command[] {
  const list = orphans();
  if (list.length === 0) {
    return [
      {
        title: "このページに引き継げるメモはありません",
        subtitle:
          "同じ URL で書かれ、タブとの結びつきが切れたものだけが並びます",
        icon: faviconURL("about:blank"),
      },
    ];
  }

  return list.flatMap((orphan): Command[] => {
    const origin = `元: ${orphan.title || orphan.url} · ${timeAgo(orphan.updatedAt)}`;
    return [
      {
        title: `現在のタブに引き継ぐ: ${previewOf(orphan.text)}`,
        subtitle: origin,
        memo: orphan.text,
        icon: faviconURL(orphan.url),
        handler: () => void run(() => adoptOrphan(orphan.recordId)),
      },
      {
        title: `破棄する: ${previewOf(orphan.text)}`,
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
    subtitle: "このタブの付箋にカーソルを移す (無ければ作る)",
    icon: faviconURL("about:blank"),
    handler: () => void run(editMemo),
  },
  {
    title: "Memo: Toggle Memo Size",
    subtitle: "付箋を最小化する / 元の大きさに戻す",
    icon: faviconURL("about:blank"),
    handler: () => void run(toggleSize),
  },
  {
    title: "Memo: Remove Memo",
    subtitle: "このタブのメモを削除する",
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
      title: `Memo: Resolve Orphaned Memos (${count})`,
      subtitle:
        "このページで書かれ、タブとの結びつきが切れたメモを引き継ぐ / 破棄する",
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
