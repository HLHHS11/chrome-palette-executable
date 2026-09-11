import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import { timeAgo } from "@pages/lib/time-ago";
import type { OrphanTabMemo, TabMemo } from "@pages/tab-memo";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../util/favicon";

export const TAB_MEMO_KEYWORD = "tm";
/** 宙に浮いたメモ (セッション復元でタブを決めきれなかったもの) の後始末。 */
export const TAB_MEMO_ORPHAN_KEYWORD = "tmo";

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
 * パレットはポップアップなので、開くたびに現在のタブのメモを読み直す。
 * 編集開始時に既存の本文を入力欄へ流し込むために使う。
 */
const currentMemo = createLazyResource<TabMemo | null>(null, async () => {
  const response = await callBackgroundRpc({
    name: "tabMemo.get",
    tabId: await currentTabId(),
  });
  if (!response.ok || !("data" in response)) return null;
  return response.data.memo;
});

/**
 * 復元時に「どのタブのメモか決めきれなかった」ものの一覧。
 *
 * URL が同じタブが複数あるとき、`@core/tab-bound-store` はあえて推測せずに
 * 結合を諦める。その行き場を与えるのがこのコマンド群。
 */
const orphans = createLazyResource<OrphanTabMemo[]>([], async () => {
  const response = await callBackgroundRpc({ name: "tabMemo.listOrphans" });
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

async function saveMemo(text: string): Promise<void> {
  const response = await callBackgroundRpc({
    name: "tabMemo.setText",
    tabId: await currentTabId(),
    text,
  });
  if (!response.ok) throw new Error(response.error);
}

async function removeMemo(): Promise<void> {
  const response = await callBackgroundRpc({
    name: "tabMemo.remove",
    tabId: await currentTabId(),
  });
  if (!response.ok) throw new Error(response.error);
}

async function setDisplayState(
  state: "minimized" | "normal" | "expanded"
): Promise<void> {
  const response = await callBackgroundRpc({
    name: "tabMemo.setDisplayState",
    tabId: await currentTabId(),
    state,
  });
  if (!response.ok) throw new Error(response.error);
}

/**
 * `tm>` に続けて入力した文字列がそのままメモ本文になる。
 *
 * ページ側には追加ボタンを置かない方針なので、ここがメモを作る唯一の入口。
 */
function editingCommands(query: string): Command[] {
  const memo = currentMemo();
  const text = query.trim();

  if (text.length === 0) {
    const existing = memo?.text ?? "";
    return [
      {
        title:
          existing.length > 0
            ? "続けて入力するとメモを上書きします"
            : "続けて入力するとメモを作成します",
        subtitle:
          existing.length > 0
            ? `現在のメモ: ${existing}`
            : "このタブに紐づきます",
        icon: faviconURL("about:blank"),
      },
    ];
  }

  return [
    {
      title: `メモを保存: ${text}`,
      subtitle: memo
        ? "既存のメモを上書きします"
        : "このタブにメモを作成します",
      icon: faviconURL("about:blank"),
      handler: () => void run(() => saveMemo(text)),
    },
  ];
}

async function adoptOrphan(recordId: string): Promise<void> {
  const response = await callBackgroundRpc({
    name: "tabMemo.adoptOrphan",
    recordId,
    tabId: await currentTabId(),
  });
  if (!response.ok) throw new Error(response.error);
}

async function forgetOrphan(recordId: string): Promise<void> {
  const response = await callBackgroundRpc({
    name: "tabMemo.forgetOrphan",
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
        title: "宙に浮いたメモはありません",
        subtitle: "すべてのメモがタブに結びついています",
        icon: faviconURL("about:blank"),
      },
    ];
  }

  // 引き継ぎ先のタブに既にメモがあると、そちらが押し出されて孤児に戻る。
  // 消えはしないが黙って画面から消えるので、行の時点で断っておく。
  const displaced = currentMemo()?.text;

  return list.flatMap((orphan): Command[] => {
    const origin = `元: ${orphan.title || orphan.url} · ${timeAgo(orphan.updatedAt)}`;
    return [
      {
        title: `現在のタブに引き継ぐ: ${previewOf(orphan.text)}`,
        subtitle: displaced
          ? `${origin} / 今のメモ「${previewOf(displaced)}」は一覧に戻ります`
          : origin,
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
    title: "Tab Memo: Write Memo for Current Tab",
    subtitle: "このタブにメモを書く / 上書きする",
    keyword: `${TAB_MEMO_KEYWORD}>`,
    icon: faviconURL("about:blank"),
    handler: () => setInput(`${TAB_MEMO_KEYWORD}>`),
  },
  {
    title: "Tab Memo: Remove Memo from Current Tab",
    subtitle: "このタブのメモを削除する",
    icon: faviconURL("about:blank"),
    handler: () => void run(removeMemo),
  },
  {
    title: "Tab Memo: Minimize Memo",
    subtitle: "つまみだけ残して折りたたむ",
    icon: faviconURL("about:blank"),
    handler: () => void run(() => setDisplayState("minimized")),
  },
  {
    title: "Tab Memo: Expand Memo",
    subtitle: "大きめの表示に切り替える",
    icon: faviconURL("about:blank"),
    handler: () => void run(() => setDisplayState("expanded")),
  },
  {
    title: "Tab Memo: Restore Memo Size",
    subtitle: "通常の大きさに戻す",
    icon: faviconURL("about:blank"),
    handler: () => void run(() => setDisplayState("normal")),
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
      title: `Tab Memo: Resolve Orphaned Memos (${count})`,
      subtitle: "再起動でタブを決めきれなかったメモを引き継ぐ / 破棄する",
      keyword: `${TAB_MEMO_ORPHAN_KEYWORD}>`,
      icon: faviconURL("about:blank"),
      handler: () => setInput(`${TAB_MEMO_ORPHAN_KEYWORD}>`),
    },
  ];
}

export default function tabMemoSuggestions(): Command[] {
  const { isMatch, isCommand, query } = matchCommand(TAB_MEMO_KEYWORD);
  if (isMatch) return editingCommands(query);
  if (matchCommand(TAB_MEMO_ORPHAN_KEYWORD).isMatch) return orphanCommands();
  if (isCommand) return [];
  return [...entryCommands, ...orphanEntryCommands()];
}
