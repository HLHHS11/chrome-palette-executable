import type { Command } from "@core/command";
import { createRuntimeRpcClient } from "@core/rpc";
import type { backgroundRoutes } from "@pages/background/routes";
import type { TabMemo } from "@pages/tab-memo";

import { createLazyResource, matchCommand, setInput } from "~/util/signals";

import { faviconURL } from "../../util/favicon";

export const TAB_MEMO_KEYWORD = "tm";

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

export default function tabMemoSuggestions(): Command[] {
  const { isMatch, isCommand, query } = matchCommand(TAB_MEMO_KEYWORD);
  if (isMatch) return editingCommands(query);
  if (isCommand) return [];
  return entryCommands;
}
